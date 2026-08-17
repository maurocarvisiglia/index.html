#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APOLLO_KEY = process.env.APOLLO_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
// Ridotto da 20: da quando ogni azienda puo' richiedere fino a 3 chiamate in sequenza
// (organization enrich + people search Italia + traduzione Gemini), 20/giorno faceva
// scadere sempre in timeout la funzione serverless Vercel (60s) — zero progressi dal
// 14 agosto nonostante il cron girasse ogni giorno. Il guardrail TIME_BUDGET_MS sotto
// e' la vera rete di sicurezza; questo numero e' solo un tetto ottimistico di partenza.
const DAILY_LIMIT = Number(process.env.APOLLO_DAILY_LIMIT || 6);
// Si ferma da solo ben prima del limite reale della funzione serverless, qualunque
// esso sia — piu' robusto che indovinare il numero giusto di aziende per invocazione.
const TIME_BUDGET_MS = 45000;

const supabase = createClient(SB_URL, SB_KEY);

function normalize(name) {
  if (!name) return '';
  let n = name.toLowerCase();
  n = n.replace(/\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|s\.?t\.?p\.?|ltd|inc|italia|italy|s\.?u\.?|società|per azioni|a responsabilità limitata|unipersonale)\b/gi, '');
  n = n.replace(/[.,'’\-–—()|]/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

function extractDomain(website) {
  if (!website) return null;
  try {
    const url = website.match(/^https?:\/\//) ? website : 'https://' + website;
    return new URL(url).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

// Doppio controllo: token condivisi per nomi "normali", forma compatta senza spazi
// per nomi/acronimi corti che il confronto a token perderebbe (es. "ACEF" == "A.C.E.F.")
function isPlausibleMatch(companyName, apolloName) {
  const a = normalize(companyName).split(' ').filter(t => t.length > 2);
  const b = normalize(apolloName).split(' ').filter(t => t.length > 2);
  if (a.length && b.length) {
    const setB = new Set(b);
    const overlap = a.filter(t => setB.has(t)).length;
    if (overlap >= 1 && overlap / Math.min(a.length, b.length) >= 0.4) return true;
  }
  const squashA = normalize(companyName).replace(/\s+/g, '');
  const squashB = normalize(apolloName).replace(/\s+/g, '');
  if (squashA.length >= 2 && squashB.length >= 2) {
    if (squashB.startsWith(squashA) || squashA.startsWith(squashB)) return true;
  }
  return false;
}

function revenueToRange(revenue) {
  if (revenue == null) return null;
  if (revenue < 5e6) return '<5M';
  if (revenue < 20e6) return '5-20M';
  if (revenue < 100e6) return '20-100M';
  if (revenue < 250e6) return '100-250M';
  if (revenue < 500e6) return '250-500M';
  return '>500M';
}

async function enrichDomain(domain) {
  const res = await axios.get('https://api.apollo.io/api/v1/organizations/enrich', {
    params: { domain },
    headers: { 'x-api-key': APOLLO_KEY },
    timeout: 8000,
  });
  return res.data.organization || null;
}

// Apollo restituisce SEMPRE i dati della casa madre globale (estimated_num_employees,
// departmental_head_count, fatturato, crescita) — mai il dato della sola filiale
// italiana. Per "dipendenti" (campo trattato ovunque nell'app come headcount Italia)
// usiamo invece un conteggio via People Search filtrato per persona in Italia: e' una
// sottostima nota (conta solo i profili LinkedIn indicizzati da Apollo, non il totale
// reale), ma e' un dato Italia-specifico e omogeneo tra aziende — scelta deliberata
// dell'utente: meglio sottostimato-ma-corretto che globale-ma-sbagliato.
async function getItalyEmployeeCount(domain) {
  try {
    const res = await axios.post(
      'https://api.apollo.io/api/v1/mixed_people/api_search',
      { q_organization_domains_list: [domain], person_locations: ['Italy'], page: 1, per_page: 1 },
      { headers: { 'x-api-key': APOLLO_KEY, 'Content-Type': 'application/json' }, timeout: 8000 }
    );
    return Number.isFinite(res.data.total_entries) ? res.data.total_entries : null;
  } catch (e) {
    return null;
  }
}

// Traduce la descrizione aziendale (Apollo la restituisce sempre in inglese, anche
// per aziende italiane) usando un modello Gemini diverso da quello dell'estrazione
// aree terapeutiche (quota giornaliera separata, per non farsi concorrenza a vicenda).
// Se la traduzione fallisce per qualsiasi motivo (quota, rete, ecc.) si ripiega sul
// testo originale in inglese invece di bloccare l'arricchimento dell'azienda.
async function translateDescriptionToItalian(text) {
  if (!GEMINI_KEY || !text) return text;
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_KEY}`,
      { contents: [{ parts: [{ text: `Traduci in italiano corrente questo testo aziendale, senza aggiungere o omettere informazioni. Rispondi SOLO con la traduzione, niente altro.\n\nTESTO:\n"""${text}"""` }] }] },
      { timeout: 8000 }
    );
    const translated = res.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return translated || text;
  } catch (e) {
    return text;
  }
}

// Aggiunge al catalogo scollegato apollo_industries solo le industry mai viste
// (chiave = apollo_tag_id, non il testo, per evitare doppioni su varianti di label)
async function upsertIndustryCatalog(industries, tagHash) {
  if (!industries?.length || !tagHash) return;
  const rows = industries
    .filter(label => tagHash[label])
    .map(label => ({ apollo_tag_id: tagHash[label], label }));
  if (!rows.length) return;
  await supabase.from('apollo_industries').upsert(rows, { onConflict: 'apollo_tag_id', ignoreDuplicates: true });
}

async function upsertDepartmentHeadcount(companyId, departmentalHeadCount) {
  if (!departmentalHeadCount) return;
  const rows = Object.entries(departmentalHeadCount)
    .filter(([, count]) => Number.isFinite(count))
    .map(([department, count]) => ({ company_id: companyId, department, headcount: count, fonte: 'apollo', rilevato_il: new Date().toISOString() }));
  if (!rows.length) return;
  await supabase.from('company_department_headcount').upsert(rows, { onConflict: 'company_id,department' });
}

async function runApolloDailyBatch() {
  const log = [];
  const push = (msg) => { console.log(msg); log.push(msg); };

  push('🤖 APOLLO DAILY BATCH — ' + new Date().toISOString());

  const { data: doneRows } = await supabase.from('enrichment_log').select('company_id').eq('api_usata', 'apollo');
  const doneIds = new Set(doneRows.map(r => r.company_id));

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, website, dipendenti, fatturato_range, descrizione_aziendale, linkedin_url, crescita_dipendenti_12m, apollo_keywords, apollo_industry')
    .not('website', 'is', null);

  const { data: jobRows } = await supabase.from('job_listings').select('company_id');
  const hasJobs = new Set(jobRows.map(r => r.company_id).filter(Boolean));

  const todo = companies
    .filter(c => !doneIds.has(c.id))
    .map(c => ({ ...c, domain: extractDomain(c.website), hasJobs: hasJobs.has(c.id) }))
    .filter(c => c.domain)
    .sort((a, b) => {
      if (a.hasJobs !== b.hasJobs) return a.hasJobs ? -1 : 1; // prima chi ha annunci
      return a.name.localeCompare(b.name, 'it'); // poi alfabetico
    })
    .slice(0, DAILY_LIMIT);

  push(`Batch di oggi: ${todo.length} aziende (già processate in precedenza: ${doneIds.size})`);

  const startTime = Date.now();
  let matched = 0, mismatched = 0, notFound = 0, errors = 0, updated = 0, stoppedEarly = false, timeBudgetExceeded = false;

  for (const c of todo) {
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      timeBudgetExceeded = true;
      push(`⏱️  Budget di tempo esaurito (${TIME_BUDGET_MS / 1000}s) — mi fermo qui per non far scadere la funzione, riprende al prossimo run.`);
      break;
    }
    try {
      const org = await enrichDomain(c.domain);
      if (!org) {
        notFound++;
        push(`   ⬜ "${c.name}" (${c.domain}) — non trovata su Apollo`);
        await supabase.from('enrichment_log').insert({ company_id: c.id, timestamp: new Date().toISOString(), api_usata: 'apollo', parsing_riuscito: false, campi_estratti: { esito: 'not_found' } });
        continue;
      }

      if (!isPlausibleMatch(c.name, org.name)) {
        mismatched++;
        push(`   ⚠️  "${c.name}" (${c.domain}) — MISMATCH con "${org.name}", scartata`);
        await supabase.from('enrichment_log').insert({ company_id: c.id, timestamp: new Date().toISOString(), api_usata: 'apollo', parsing_riuscito: false, campi_estratti: { esito: 'mismatch', apollo_name: org.name } });
        continue;
      }
      matched++;

      const revenueRange = revenueToRange(org.annual_revenue);
      const patch = {};
      if (!c.dipendenti) {
        const italyCount = await getItalyEmployeeCount(c.domain);
        if (italyCount != null) patch.dipendenti = italyCount;
      }
      if (!c.fatturato_range && revenueRange) patch.fatturato_range = revenueRange;
      if (!c.descrizione_aziendale && org.short_description) {
        patch.descrizione_aziendale = await translateDescriptionToItalian(org.short_description);
      }
      if (!c.linkedin_url && org.linkedin_url) patch.linkedin_url = org.linkedin_url;
      if (c.crescita_dipendenti_12m == null && org.organization_headcount_twelve_month_growth != null) {
        patch.crescita_dipendenti_12m = org.organization_headcount_twelve_month_growth;
      }
      if ((!c.apollo_keywords || !c.apollo_keywords.length) && org.keywords?.length) patch.apollo_keywords = org.keywords;
      if (!c.apollo_industry && org.industry) patch.apollo_industry = org.industry;
      if (org.industries?.length) patch.apollo_industries = org.industries;

      const filledCount = ['dipendenti', 'fatturato_range', 'descrizione_aziendale', 'linkedin_url']
        .filter(f => (patch[f] !== undefined ? true : !!c[f])).length;
      const completeness = Math.round((filledCount / 4) * 100);

      await supabase.from('companies').update({
        ...patch,
        arricchito_il: new Date().toISOString(),
        completezza_arricchimento: completeness,
      }).eq('id', c.id);

      await upsertIndustryCatalog(org.industries, org.industry_tag_hash);
      await upsertDepartmentHeadcount(c.id, org.departmental_head_count);

      await supabase.from('enrichment_log').insert({
        company_id: c.id,
        timestamp: new Date().toISOString(),
        api_usata: 'apollo',
        parsing_riuscito: true,
        risultato_grezzo: { domain: c.domain, apollo_org_id: org.id },
        campi_estratti: patch,
      });

      updated++;
      push(`   ✅ "${c.name}" (${c.domain})`);
    } catch (e) {
      errors++;
      const status = e.response?.status;
      const msg = e.response?.data ? JSON.stringify(e.response.data) : e.message;
      push(`   ❌ "${c.name}" — ERRORE ${status || ''}: ${msg}`);
      if (status === 401 || status === 403 || status === 429) {
        push(`🛑 Interruzione batch: errore ${status} sembra sistemico (credito/rate-limit/auth).`);
        stoppedEarly = true;
        break;
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }

  const summary = { attempted: todo.length, matched, updated, mismatched, notFound, errors, stoppedEarly, timeBudgetExceeded };
  push(`📊 RISULTATO: ${JSON.stringify(summary)}`);
  return { summary, log };
}

export { runApolloDailyBatch };

const isCLI = process.argv[1] && process.argv[1].includes('apollo-enrichment-agent.js');
if (isCLI) {
  runApolloDailyBatch().catch(e => {
    console.error('❌ ERRORE TOP-LEVEL:', e.message);
    process.exit(1);
  });
}
