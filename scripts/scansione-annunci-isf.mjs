/**
 * SCANSIONE ANNUNCI ISF · informatori.it + informatori-scientifici.it
 * =============================================================================
 *   node scripts/scansione-annunci-isf.mjs            misura, non scrive (dry-run)
 *   node scripts/scansione-annunci-isf.mjs --apply    aggiorna company_annunci
 *
 * COSTO: ZERO — due portali pubblici di annunci per Informatori Scientifici.
 * robots.txt di entrambi consente la lista annunci.
 *
 * COSA FA
 *   · informatori-scientifici.it/annunci-lavoro/ : pagina unica, blocchi
 *     strutturati (azienda / ruolo / zona / prodotti / aree / offerta).
 *   · informatori.it/job-sitemap.xml : elenco URL; da slug + lastmod ricava
 *     azienda / ruolo / zona / data (scarta i test 2021 e tutto cio' < 2026).
 *   · classifica la RETE commerciale dall'offerta economica / dallo slug:
 *       "contratto di Agenzia / P.IVA / plurimandato"  -> Agenti
 *       "CCNL ... / auto aziendale / dipendente"        -> Dipendenti
 *       presenza di entrambi i segnali                  -> Misto
 *   · abbina l'azienda dell'annuncio all'anagrafica in modo CONSERVATIVO
 *     (uguaglianza normalizzata o contenimento di parole, token >= 4 lettere
 *     per evitare i falsi positivi tipo "LUO" dentro "Fluorsid").
 *
 * AGGIORNAMENTO: snapshot. Ad ogni --apply cancella e ricarica le righe di
 * company_annunci per le due fonti (fotografia degli annunci ATTIVI oggi).
 * Dove l'abbinamento e' certo e il campo e' vuoto, scrive anche
 * companies.tipo_rete_commerciale.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config();

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APPLY = process.argv.includes('--apply');
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', D = '\x1b[2m', Z = '\x1b[0m';

const envFile = (n) => (readFileSync(join(ROOT, '.env'), 'utf8').match(new RegExp('^\\s*' + n + '=(.*)$', 'm')) || [])[1]?.trim();
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || envFile('SUPABASE_SERVICE_ROLE_KEY');
const SB = (process.env.SUPABASE_URL || envFile('SUPABASE_URL') || '').replace(/\/+$/, '') + '/rest/v1';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function sb(path, init = {}) {
  const r = await fetch(`${SB}/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function getText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'it-IT,it;q=0.9' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} su ${url}`);
  return await r.text();
}

const stripTags = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);

// ---- classificazione rete ----
function classificaRete(testo) {
  const t = (testo || '').toLowerCase();
  const agente = /\bp\.?\s?iva\b|agenzia|plurimandat|monomandat|provvigion|consulenza/.test(t);
  const dip = /\bccnl\b|auto aziendale|tempo (determinato|indeterminato)|dipendent|assunzione|stock option/.test(t);
  if (agente && dip) return 'Misto';
  if (dip) return 'Dipendenti';
  if (agente) return 'Agenti';
  return null;
}

// ---- parser informatori-scientifici.it ----
const toIso = (s) => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : (s || null); };
function parseScientifici(lines) {
  const out = [];
  const isData = (s) => /^\d{2}-\d{2}-\d{4}$/.test(s);
  for (let i = 0; i < lines.length; i++) {
    if (!isData(lines[i])) continue;
    const blocco = { data: toIso(lines[i]) };
    const campi = {};
    let j = i + 1, seq = [];
    while (j < lines.length && !isData(lines[j]) && lines[j] !== 'IN EVIDENZA') {
      const L = lines[j];
      if (/^Prodotti:?$/i.test(L)) { campi._k = 'prodotti'; }
      else if (/^Aree terapeutiche:?$/i.test(L)) { campi._k = 'aree'; }
      else if (/^Offerta economica:?$/i.test(L)) { campi._k = 'offerta'; }
      else if (campi._k) { campi[campi._k] = (campi[campi._k] ? campi[campi._k] + ' ' : '') + L; }
      else { seq.push(L); }
      j++;
    }
    if (seq.length >= 2) {
      blocco.azienda = seq[0];
      blocco.ruolo = seq[1];
      blocco.zona = seq.slice(2).join(' ') || null;
      blocco.prodotti = campi.prodotti || null;
      blocco.aree = campi.aree || null;
      blocco.offerta = campi.offerta || null;
      blocco.rete = classificaRete(campi.offerta);
      blocco.url = null;
      out.push(blocco);
    }
    i = j - 1;
  }
  return out;
}

// ---- parser informatori.it (da sitemap) ----
const RUOLI = [
  ['informatori scientifici agenti', 'Informatori Scientifici Agenti'],
  ['informatori medico scientifici', 'Informatori Medico Scientifici'],
  ['informatore medico scientifico', 'Informatore Medico Scientifico'],
  ['informatori scientifici del farmaco', 'ISF del Farmaco'],
  ['informatore scientifico del farmaco', 'ISF del Farmaco'],
  ['informatori scientifici', 'Informatori Scientifici'],
  ['informatore scientifico', 'Informatore Scientifico'],
  ['isf specialist', 'ISF Specialist'],
  ['area manager', 'Area Manager'],
  ['agente commerciale', 'Agente Commerciale'],
  ['agenti', 'Agenti'],
  ['product specialist', 'Product Specialist'],
  ['sales specialist', 'Sales Specialist'],
  ['consulenti scientifici', 'Consulenti Scientifici'],
  ['patient access manager', 'Patient Access Manager'],
  ['collaboratori commerciali', 'Collaboratori Commerciali'],
];
const TEST_SLUG = /prova-azienda|birillo|acme-riattivatore|cristina-informatori|natural-bradel|divoratore/;
function parseInformatori(xml) {
  const blocchi = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => m[1]);
  const out = [];
  for (const b of blocchi) {
    const loc = (b.match(/<loc>(.*?)<\/loc>/) || [])[1];
    const lastmod = (b.match(/<lastmod>(.*?)<\/lastmod>/) || [])[1] || '';
    if (!loc || !/\/annunci-lavoro\/[^/]+\/?$/.test(loc)) continue;
    const slug = loc.replace(/\/$/, '').split('/').pop();
    if (slug === 'annunci-lavoro' || TEST_SLUG.test(slug)) continue;
    const anno = +(lastmod.slice(0, 4) || 0);
    if (anno < 2026) continue;
    let resto = slug.replace(/-\d+$/, '');  // via suffisso numerico
    let ruolo = null, ruoloSlug = '';
    for (const [k, v] of RUOLI) { if (resto.includes(k.replace(/ /g, '-'))) { ruolo = v; ruoloSlug = k.replace(/ /g, '-'); break; } }
    const azienda = (ruoloSlug ? resto.split(ruoloSlug)[0] : resto).replace(/-+$/,'').replace(/-/g, ' ').trim()
      .replace(/\b\w/g, c => c.toUpperCase());
    const coda = ruoloSlug ? resto.split(ruoloSlug)[1] || '' : '';
    const zona = coda.replace(/-/g, ' ').trim() || null;
    out.push({
      data: lastmod.slice(0, 10) || null, azienda, ruolo: ruolo || 'Informatore Scientifico',
      zona, prodotti: null, aree: null, offerta: null,
      rete: /agenti|agente/.test(slug) ? 'Agenti' : null, url: loc,
    });
  }
  return out;
}

// ---- abbinamento aziende (conservativo) ----
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const RUMORE = new Set(['srl', 'srls', 'spa', 'sas', 'snc', 'sb', 'italia', 'italy', 'group', 'srl.', 'the', 'di']);
const tokens = (s) => norm(s).split(' ').filter(w => w.length >= 4 && !RUMORE.has(w));
// nome "core": senza forma giuridica e parole di rumore, token di 2+ lettere
const core = (s) => norm(s).split(' ').filter(w => w.length >= 2 && !RUMORE.has(w)).join(' ');
function abbina(nome, aziende) {
  const n = norm(nome);
  const esatto = aziende.find(a => a.n === n);
  if (esatto) return esatto.id;
  // livello 2: nome-core identico, solo se una sola azienda lo ha (FB Vision, ecc.)
  const c = core(nome);
  if (c) {
    const perCore = aziende.filter(a => a.c === c);
    if (perCore.length === 1) return perCore[0].id;
    if (perCore.length > 1) return null;  // genuinamente ambiguo (es. Biogroup, IQVIA)
  }
  // livello 3: contenimento di parole (token >= 4), solo se univoco
  const ta = tokens(nome);
  if (!ta.length) return null;
  const cand = aziende.filter(a => {
    const tc = a.t;
    if (!tc.length) return false;
    const sub = (x, y) => x.every(w => y.includes(w));
    return sub(ta, tc) || sub(tc, ta);
  });
  return cand.length === 1 ? cand[0].id : null;  // solo se univoco
}

async function main() {
  console.log(`${D}Scansione annunci ISF — ${APPLY ? 'APPLY' : 'dry-run'}${Z}`);
  // 1) scarica
  let s1 = [], s2 = [];
  try { s1 = parseScientifici(stripTags(await getText('https://www.informatori-scientifici.it/annunci-lavoro/'))); }
  catch (e) { console.log(`${R}informatori-scientifici.it KO: ${e.message}${Z}`); }
  try { s2 = parseInformatori(await getText('https://informatori.it/job-sitemap.xml')); }
  catch (e) { console.log(`${R}informatori.it KO: ${e.message}${Z}`); }
  console.log(`Annunci: informatori-scientifici.it ${s1.length} · informatori.it ${s2.length}`);

  // 2) anagrafica per abbinamento
  const aziende = (await sb('companies?select=id,name&merged_into=is.null')).map(a => ({ id: a.id, n: norm(a.name), c: core(a.name), t: tokens(a.name) }));

  const righe = [];
  for (const [fonte, arr] of [['informatori-scientifici.it', s1], ['informatori.it', s2]]) {
    for (const a of arr) {
      righe.push({
        company_id: abbina(a.azienda, aziende), nome_azienda: a.azienda, ruolo: a.ruolo, zona: a.zona,
        prodotti: a.prodotti, aree_terapeutiche: a.aree, offerta_economica: a.offerta,
        tipo_rete: a.rete, data_annuncio: a.data, fonte, url: a.url,
      });
    }
  }
  const agganciate = righe.filter(r => r.company_id).length;
  console.log(`Totale ${righe.length} righe · agganciate ${agganciate} · nuove/non abbinate ${righe.length - agganciate}`);

  if (!APPLY) { console.log(`${Y}dry-run: nessuna scrittura. Esempi:${Z}`); console.table(righe.slice(0, 8).map(r => ({ azienda: r.nome_azienda, ruolo: r.ruolo, rete: r.tipo_rete, abbinata: !!r.company_id, fonte: r.fonte }))); return; }

  // 3) snapshot: cancella e ricarica le due fonti
  await sb(`company_annunci?fonte=in.(${encodeURIComponent('"informatori-scientifici.it","informatori.it"')})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  for (let i = 0; i < righe.length; i += 200) {
    await sb('company_annunci', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(righe.slice(i, i + 200)) });
  }
  // 4) scrive tipo_rete dove certo e mancante
  let reteScritte = 0;
  const perAzienda = new Map();
  for (const r of righe) if (r.company_id && r.tipo_rete) perAzienda.set(r.company_id, (perAzienda.get(r.company_id) || new Set()).add(r.tipo_rete));
  for (const [cid, set] of perAzienda) {
    const val = set.size === 1 ? [...set][0] : 'Misto';
    const cur = await sb(`companies?id=eq.${cid}&select=tipo_rete_commerciale`);
    if (cur && cur[0] && !cur[0].tipo_rete_commerciale) {
      await sb(`companies?id=eq.${cid}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ tipo_rete_commerciale: val }) });
      reteScritte++;
    }
  }
  console.log(`${G}Scritte ${righe.length} righe annunci · tipo_rete aggiornato su ${reteScritte} aziende${Z}`);
}
main().catch(e => { console.error(`${R}${e.stack || e.message}${Z}`); process.exit(1); });
