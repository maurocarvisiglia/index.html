/**
 * APOLLO · RACCOLTA UNIFICATA GIORNALIERA · una sola visita per azienda
 * =============================================================================
 *   node scripts/apollo-unificato-giornaliero.mjs               misura (12 aziende)
 *   node scripts/apollo-unificato-giornaliero.mjs --apply       scrive
 *   node scripts/apollo-unificato-giornaliero.mjs --apply --n=8 quantita' diversa
 *
 * SOSTITUISCE tre script che il 23/09/2026 giravano separati sulle STESSE
 * aziende, ognuno con la propria ricerca Apollo — richiesto esplicitamente da
 * Mauro ("un'unica chiamata per tutte le informazioni, non piu' chiamate
 * diverse"): apollo-enrichment-agent.js (dati azienda), organico-automatico-
 * giornaliero.mjs (organico per funzione), apollo-decision-makers.mjs
 * (decision maker + email). Per ogni azienda, UNA sola visita fa tutto:
 *
 *   1. organizations/enrich(dominio) — descrizione, LinkedIn, crescita,
 *      industry, organico per reparto (aggregato, senza nomi)
 *   2. mixed_people/api_search(dominio) in paginazione — l'UNICA ricerca
 *      persone, usata per DUE scopi insieme (non due ricerche separate):
 *        a. classificazione organico per funzione (company_workforce)
 *        b. individuazione del decision maker (titoli HR/TA, poi C-level
 *           di ripiego) DENTRO la stessa lista gia' scaricata
 *      Il conteggio Italia (companies.dipendenti) viene da qui (total_entries
 *      dichiarato da Apollo), non da una terza chiamata dedicata come prima.
 *   3. people/match(id) — UNA sola rivelazione email, solo per il decision
 *      maker gia' individuato al punto 2b, mai una ricerca a parte.
 *
 * COSTO: i punti 1 e 3 consumano crediti del piano (scoperto il 23/09/2026:
 * anche organizations/enrich, non solo people/match); il punto 2 e' solo
 * ricerca, gratuito, limitato solo dalla frequenza Apollo. Se i crediti sono
 * esauriti, i punti 1 e 3 falliscono ma il punto 2 (il piu' voluminoso: fino a
 * 1.500 persone per azienda) prosegue comunque — non si perde mai il lavoro
 * gratuito per un errore sul lavoro a pagamento.
 *
 * REGISTRO — company_workforce e' il gate per "azienda gia' visitata" (come
 * prima): un'azienda con righe li' non viene ripescata. L'arricchimento dati
 * azienda si ritenta naturalmente finche' i suoi campi restano NULL (stesso
 * principio gia' in uso in apollo-enrichment-agent.js). Il decision maker usa
 * il registro company_facts_lookup_log(tipo='decision_maker_apollo') — stesso
 * usato da apollo-decision-makers.mjs, cosi' le aziende gia' tentate da quello
 * script il 23/09 non vengono ririsollevate qui.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APOLLO_KEY = process.env.APOLLO_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const DM_REGISTRO_TIPO = 'decision_maker_apollo';
const TIME_BUDGET_MS = 45000;

const argN = (process.argv.find((a) => a.startsWith('--n=')) || '').slice(4);
const N_OGGI = Number(process.env.APOLLO_UNIFICATO_DAILY_LIMIT || argN || 12);
const APPLY = process.argv.includes('--apply');

function normalize(name) {
  if (!name) return '';
  let n = name.toLowerCase();
  n = n.replace(/\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|s\.?t\.?p\.?|ltd|inc|italia|italy|s\.?u\.?|società|per azioni|a responsabilità limitata|unipersonale)\b/gi, '');
  n = n.replace(/[.,'’\-–—()|]/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}
function isPlausibleMatch(companyName, apolloName) {
  const a = normalize(companyName).split(' ').filter((t) => t.length > 2);
  const b = normalize(apolloName).split(' ').filter((t) => t.length > 2);
  if (a.length && b.length) {
    const setB = new Set(b);
    const overlap = a.filter((t) => setB.has(t)).length;
    if (overlap >= 1 && overlap / Math.min(a.length, b.length) >= 0.4) return true;
  }
  const squashA = normalize(companyName).replace(/\s+/g, '');
  const squashB = normalize(apolloName).replace(/\s+/g, '');
  if (squashA.length >= 2 && squashB.length >= 2) {
    if (squashB.startsWith(squashA) || squashA.startsWith(squashB)) return true;
  }
  return false;
}
function extractDomain(website) {
  if (!website) return null;
  try {
    const url = website.match(/^https?:\/\//) ? website : 'https://' + website;
    return new URL(url).hostname.replace(/^www\./, '') || null;
  } catch { return null; }
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
async function translateDescriptionToItalian(text) {
  if (!GEMINI_KEY || !text) return text;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: `Traduci in italiano corrente questo testo aziendale, senza aggiungere o omettere informazioni. Rispondi SOLO con la traduzione, niente altro.\n\nTESTO:\n"""${text}"""` }] }] }),
    });
    const d = await res.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
  } catch { return text; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Apollo — tre soli endpoint, ciascuno chiamato al massimo una volta per azienda
// (il people search pagina, ma e' logicamente UNA ricerca, non ricerche multiple).
// ─────────────────────────────────────────────────────────────────────────────
async function enrichOrganization(domain) {
  const r = await fetch(`https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`, { headers: { 'x-api-key': APOLLO_KEY } });
  if (r.status === 402 || r.status === 422) throw new Error('CREDITI_ESAURITI');
  if (!r.ok) throw new Error(`org enrich HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const d = await r.json();
  return d.organization || null;
}
async function paginaPersone(domain, pagina, tentativo = 1) {
  const r = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
    method: 'POST', headers: { 'x-api-key': APOLLO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q_organization_domains_list: [domain], person_locations: ['Italy'], page: pagina, per_page: 100 }),
  });
  if (r.status === 429 && tentativo <= 3) {
    await new Promise((ok) => setTimeout(ok, 65000));
    return paginaPersone(domain, pagina, tentativo + 1);
  }
  if (!r.ok) throw new Error(`people search HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}
async function rivelaPersona(id) {
  const r = await fetch('https://api.apollo.io/api/v1/people/match', {
    method: 'POST', headers: { 'x-api-key': APOLLO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (r.status === 402 || r.status === 422) throw new Error('CREDITI_ESAURITI');
  if (!r.ok) throw new Error(`people match HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const d = await r.json();
  return d.person || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classificazione organico — identica a organico-automatico-giornaliero.mjs
// ─────────────────────────────────────────────────────────────────────────────
const SETTORE_ARCHETIPO = {
  Pharma: 'farma_commerciale', 'Mid Pharma': 'farma_commerciale', 'Big Pharma': 'farma_commerciale',
  'Specialty Pharma': 'farma_commerciale', Biotech: 'farma_commerciale',
  CDMO: 'produzione_cdmo_chimico', Chimico: 'produzione_cdmo_chimico', Agrochimica: 'produzione_cdmo_chimico',
  'Medical Devices': 'medical_device_diagnostics', Diagnostics: 'medical_device_diagnostics',
  CRO: 'cro',
  Nutraceutical: 'consumer_nutraceutical_cosmetics', Cosmetics: 'consumer_nutraceutical_cosmetics', 'Consumer Health': 'consumer_nutraceutical_cosmetics',
  'Digital Health': 'digital_health',
  'Healthcare Services': 'servizi_sanitari_farmacia', 'Farmacia/Retail': 'servizi_sanitari_farmacia',
  Consulenza: 'consulenza', 'EHS/HSE Consulting': 'consulenza',
};
const UNIVERSALE = [
  ['general_management', /\bceo\b|\bcoo\b|\bcfo\b|country manager|managing director|general manager|business unit director|\bhead of\b.*\bbu\b|^director$|regional director|business area manager|member of the management board/i],
  ['hr', /\bhr\b|human resources|talent acquisition|chief happiness|employee.{0,3}(&|and).{0,3}labor|labour relations|recruiting/i],
  ['finance_admin', /financial planning|\bfinance\b|controller|accounting|administrative associate|executive assistant|accountant|payroll|treasury|\bcredit\b|\btax\b|financial controller/i],
  ['legal_compliance', /\blegal\b|patent attorney|patent counsel|compliance(?!.*quality)(?!.*regulatory)/i],
  ['it_digital', /\bit\b|\bitc\b|information technology|systems administrator|\bsap\b|help ?desk|service.?desk|networking|infrastrutture informatiche/i],
  ['procurement', /procurement|sourcing|\bbuyer\b|purchasing/i],
  ['logistics_supply_chain', /logistics?|order to cash|\btender\b|supply chain|planning.*logistic|warehouse|distribution|contract analyst|\bexport\b/i],
  ['marketing_communications', /marketing|digital.*innovation|omnichannel|customer (and|excellence|facing|engagement)|corporate affairs|public policy|congress|product manager/i],
  ['sales_commercial', /area business manager|\babm\b|district sales manager|\bkam\b|key account|sales (manager|representative|supervisor|specialist|agent|rep\b|operation)|responsabile nazionale vendite|\bsales\b|account manager|territory (sales )?manager|country sales manager|district manager|inside sales|customer (care|service|success)|\bagent\b|business manager|commerciale/i],
  ['business_development', /business development(?!.*conto terzi)(?!.*cdmo)|market development|therapy development/i],
  ['facilities_maintenance', /\bmaintenance\b|manutenzione|facilit(y|ies)|\behs\b|prevenzione (e )?protezione|energy manager|\butilities\b/i],
];
const FARMA_COMMERCIALE = [
  ['medical_affairs_msl', /medical science liaison|\bmsl\b|medical (manager|director|advisor|affairs|liaison)/i],
  ['market_access', /market access|value & access|health economics|pricing|regional affairs? manager/i],
  ['regulatory_affairs_prodotto', /regulatory affairs/i],
  ['pharmacovigilance', /pharmacovigilance|drug safety|country safety lead/i],
  ['clinical_operations_locali', /clinical (country|site lead|trial)/i],
  ['patient_support', /care manager/i],
  ['quality_assurance', /\bquality\b/i],
];
const MEDICAL_DEVICE_DIAGNOSTICS = [
  ['training_clinico', /\btraining\b|education specialist/i],
  ['clinical_affairs_device', /clinical (research|application|specialist|safety|project|business intelligence|evaluation|study|operations)|medical (science|affairs|writer|customer care)|biostatistic|patient service/i],
  ['regulatory_mdr_ivdr', /regulatory affairs|\bprrc\b/i],
  ['field_service', /field service|service (&|and) repair|technical (consultant|service|svc|support)|repair engineer|field (engineer|technical)|start-up specialist|product support/i],
  ['product_management_device', /product (manager|specialist|marketing|owner)/i],
];
const PRODUZIONE_CDMO_CHIMICO = [
  ['business_development_conto_terzi', /\bcdmo\b|\bgkam\b|screening and quoting|lead generation/i],
  ['rd_formulazione', /\br(&|and)d\b|research and development|\bricercatore\b|\bresearch|analytical (r&d|development|scientist)|formulat|innovation (manager|technician|technologist)|technical (manager|director|office)|\bphd\b/i],
  ['registrazione_conformita', /regulatory affairs|\breach\b|product regulations|registration manager|stewardship|regulatory technical support/i],
  ['quality_assurance', /\bqa\b|quality assurance|qualified person|\bqp\b|gmp compliance|validation (specialist|analyst|analist)|vp.*quality|global quality|computer system validation/i],
  ['quality_control', /\bqc\b|\bcq\b|quality control|controllo qualit|analista (del )?controllo|laboratory (technician|assistant)|\blab\b.*(technician|manager|supervisor)|lab analyst|chemical analyst|analista (di )?laboratorio|analytical chemist|microbiology/i],
  ['ehs_sustainability', /\bhse\b|\behs\b|sustainab|health (and|&) safety|environmental|waste manager|\brspp\b|\baspp\b/i],
  ['process_engineering', /process (engineer|chemistry|improvement|technologist|development|safety)|automation (engineer|specialist)|tecnologo di processo|\b(d|u)sp\b|piping.*engineering|corporate (engineering|electrical|field|project) (manager|engineer)|\bproject engineer\b|industrializ|technology transfer/i],
  ['produzione_site_operations', /production (manager|operator|planner|assistant|supervisor|coordinator|specialist|engineer|engineering)|plant (manager|director|supervisor)|shift (manager|supervisor|leader)|operatore (chimico|di|impiant[oi]|farmaceutico|polivalente|api)|operaio (chimico|di|tecnico|finissaggio)|conduttore (impianto|generatore)|reattorist|capo\s?turno|fermentation (production|operator|coordinator|process)|manufacturing (manager|assembler|engineer)|unit production|caporeparto|responsabile (produzione|turni di produzione|unit[aà] produttiva)|chemical (operator|process operator)|\b(general |skilled )?worker\b|\boperator\b|technical employee|perito chimico|\budp\b|head of production|\bsite\b.*(production|services|manager|planner|head)|operations director|head of.*(operations|production)/i],
];
const FUNZIONI_PER_ARCHETIPO = { farma_commerciale: FARMA_COMMERCIALE, medical_device_diagnostics: MEDICAL_DEVICE_DIAGNOSTICS, produzione_cdmo_chimico: PRODUZIONE_CDMO_CHIMICO };
const PAROLE_SOVRANAZIONALI = /\bemea\b|\bglobal\b|western europe|southwest europe|southern europe|\beurasia\b|\biberia\b|\bnordics?\b|\bdach\b|\bbenelux\b|\bcee\b|\beurope\b(?!an)|international/i;
const PAESI = /\b(italy|italia|greece|israel|spain|portugal|france|switzerland|austria|germany|uk|turkey|poland|balkans|latam|india|anz|japan)\b/gi;
function classificaAmbito(titolo) {
  const paesi = new Set((titolo.match(PAESI) || []).map((p) => p.toLowerCase()));
  if (PAROLE_SOVRANAZIONALI.test(titolo)) return /\bglobal\b/i.test(titolo) ? 'globale' : 'emea';
  if (paesi.size >= 2) return 'emea';
  return 'locale';
}
function estraeSede(titolo) { const m = titolo.match(/([A-Z][a-zà-ù]+)\s+Site\b/); return m ? m[1] : null; }
function classificaFunzione(titolo, listaSpecifica, archetipo) {
  for (const [funzione, re] of listaSpecifica) if (re.test(titolo)) return { livello: 'specifico', funzione, archetipo };
  for (const [funzione, re] of UNIVERSALE) if (re.test(titolo)) return { livello: 'universale', funzione, archetipo: null };
  return null;
}

// Decision maker — stessi titoli di apollo-decision-makers.mjs
const TITOLI_HR = ['HR Director', 'Head of HR', 'Head of Talent Acquisition', 'Talent Acquisition Manager', 'HR Manager', 'Human Resources Manager', 'Chief Human Resources Officer', 'CHRO', 'Responsabile HR', 'Responsabile Risorse Umane', 'Direttore Risorse Umane', 'People & Culture Director'];
const TITOLI_CLEVEL = ['CEO', 'Chief Executive Officer', 'Amministratore Delegato', 'General Manager', 'Direttore Generale', 'Managing Director', 'Founder', 'Owner'];
function trovaDecisionMaker(persone) {
  const matchTitolo = (p, lista) => p.title && lista.some((t) => p.title.toLowerCase().includes(t.toLowerCase()));
  const hr = persone.find((p) => matchTitolo(p, TITOLI_HR));
  if (hr) return { persona: hr, categoria: 'HR/Talent Acquisition' };
  const cl = persone.find((p) => matchTitolo(p, TITOLI_CLEVEL));
  if (cl) return { persona: cl, categoria: 'C-level' };
  return null;
}

function unici(righe) {
  const visti = new Set();
  return righe.filter((r) => { const k = `${r.company_id}|${r.apollo_person_id}`; if (visti.has(k)) return false; visti.add(k); return true; });
}
async function scriviWorkforce(righe) {
  const puliti = unici(righe);
  let scritte = 0;
  for (let i = 0; i < puliti.length; i += 100) {
    const lotto = puliti.slice(i, i + 100);
    const { error } = await supabase.from('company_workforce').upsert(lotto, { onConflict: 'company_id,apollo_person_id' });
    if (!error) { scritte += lotto.length; continue; }
    for (const r of lotto) { const { error: e2 } = await supabase.from('company_workforce').upsert([r], { onConflict: 'company_id,apollo_person_id' }); if (!e2) scritte++; }
  }
  return scritte;
}
async function registraDecisionMaker(companyId, esito, note) {
  try {
    await supabase.from('company_facts_lookup_log').upsert(
      { company_id: companyId, tipo: DM_REGISTRO_TIPO, esito, note: note ? String(note).slice(0, 200) : null },
      { onConflict: 'company_id,tipo' }
    );
  } catch { /* volutamente silenzioso */ }
}

// `apply` di default true: quando lo chiama Vercel (cron), process.argv non
// contiene mai '--apply' — se questo parametro non esistesse, la produzione
// non scriverebbe mai nulla. Il CLI locale passa esplicitamente APPLY (che
// resta false di default per i test manuali sicuri), stesso principio del
// resto della famiglia CORE ma corretto qui per l'uso da funzione esportata.
async function runUnificatoDailyBatch(apply = true) {
  const log = [];
  const push = (msg) => { console.log(msg); log.push(msg); };
  push(`\nApollo unificato · fino a ${N_OGGI} aziende  ${apply ? 'SCRIVE' : 'solo misura'}\n`);

  const { data: catalogateRows, error: catErr } = await supabase.from('company_workforce').select('company_id');
  if (catErr) throw new Error('lettura company_workforce fallita: ' + catErr.message);
  const giaCatalogate = new Set((catalogateRows || []).map((r) => r.company_id));

  const { data: dmTentateRows, error: dmErr } = await supabase.from('company_facts_lookup_log').select('company_id').eq('tipo', DM_REGISTRO_TIPO);
  if (dmErr) throw new Error('lettura registro decision maker fallita: ' + dmErr.message);
  const dmTentate = new Set((dmTentateRows || []).map((r) => r.company_id));

  const { data: pool, error: poolErr } = await supabase.from('companies')
    .select('id,name,website,sector_v2,dipendenti,fatturato_range,descrizione_aziendale,linkedin_url,crescita_dipendenti_12m,apollo_keywords,apollo_industry')
    .eq('is_active', true).is('merged_into', null).not('website', 'is', null)
    .order('dipendenti', { ascending: false, nullsFirst: false }).limit(6000);
  if (poolErr) throw new Error('lettura companies fallita: ' + poolErr.message);

  const candidati = [];
  for (const c of pool || []) {
    if (candidati.length >= N_OGGI) break;
    if (giaCatalogate.has(c.id)) continue; // il gate primario resta l'organico, come prima
    const archetipo = SETTORE_ARCHETIPO[c.sector_v2];
    if (!archetipo) continue;
    const dominio = extractDomain(c.website);
    if (!dominio) continue;
    candidati.push({ ...c, archetipo, dominio });
  }
  push(`candidati scelti: ${candidati.length} (pool: ${(pool || []).length}, gia' catalogate: ${giaCatalogate.size})\n`);

  const startTime = Date.now();
  let orgArricchite = 0, orgCreditiEsauriti = 0, workforceScritte = 0, personeTotali = 0;
  let dmScritti = 0, dmCreditiEsauriti = 0, errori = 0, timeBudgetExceeded = false;

  for (const c of candidati) {
    if (Date.now() - startTime > TIME_BUDGET_MS) { timeBudgetExceeded = true; push(`⏱️  Budget di tempo esaurito — mi fermo qui, riprende al prossimo run.`); break; }
    push(`${'='.repeat(70)}\n${c.name} (${c.sector_v2} -> ${c.archetipo}) · ${c.dominio}\n${'='.repeat(70)}`);

    // ── 1. organizations/enrich — solo se manca ancora qualcosa da riempire ──
    const orgIncompleta = !c.dipendenti || !c.fatturato_range || !c.descrizione_aziendale || !c.linkedin_url;
    if (orgIncompleta && apply) {
      try {
        const org = await enrichOrganization(c.dominio);
        if (org && isPlausibleMatch(c.name, org.name)) {
          const patch = {};
          if (!c.fatturato_range) { const rr = revenueToRange(org.annual_revenue); if (rr) patch.fatturato_range = rr; }
          if (!c.descrizione_aziendale && org.short_description) patch.descrizione_aziendale = await translateDescriptionToItalian(org.short_description);
          if (!c.linkedin_url && org.linkedin_url) patch.linkedin_url = org.linkedin_url;
          if (c.crescita_dipendenti_12m == null && org.organization_headcount_twelve_month_growth != null) patch.crescita_dipendenti_12m = org.organization_headcount_twelve_month_growth;
          if ((!c.apollo_keywords || !c.apollo_keywords.length) && org.keywords?.length) patch.apollo_keywords = org.keywords;
          if (!c.apollo_industry && org.industry) patch.apollo_industry = org.industry;
          if (org.industries?.length) patch.apollo_industries = org.industries;
          if (Object.keys(patch).length) {
            await supabase.from('companies').update({ ...patch, arricchito_il: new Date().toISOString() }).eq('id', c.id);
            orgArricchite++;
            push(`  organizations/enrich: ${Object.keys(patch).join(', ')}`);
          }
          if (org.departmental_head_count) {
            const rows = Object.entries(org.departmental_head_count).filter(([, n]) => Number.isFinite(n)).map(([department, headcount]) => ({ company_id: c.id, department, headcount, fonte: 'apollo', rilevato_il: new Date().toISOString() }));
            if (rows.length) await supabase.from('company_department_headcount').upsert(rows, { onConflict: 'company_id,department' });
          }
        } else if (org) {
          push(`  organizations/enrich: mismatch con "${org.name}", scartato`);
        }
      } catch (e) {
        if (e.message === 'CREDITI_ESAURITI') { orgCreditiEsauriti++; push(`  organizations/enrich: crediti esauriti, salto (si ritenta da solo quando tornano)`); }
        else { errori++; push(`  organizations/enrich ERRORE: ${e.message}`); }
      }
    }

    // ── 2. people search paginata — UNA sola ricerca, due usi ──
    let persone = [];
    try {
      let pag = 1;
      while (true) {
        const d = await paginaPersone(c.dominio, pag);
        persone.push(...(d.people || []));
        if (pag === 1) push(`  Apollo dichiara ${d.total_entries} persone in Italia`);
        if (!d.people || d.people.length < 100 || persone.length >= d.total_entries || pag >= 15) break;
        pag++;
        if (Date.now() - startTime > TIME_BUDGET_MS) break;
        await new Promise((ok) => setTimeout(ok, 400));
      }
    } catch (e) {
      errori++; push(`  people search ERRORE: ${e.message}`);
      continue; // senza la lista persone non si puo' fare ne' organico ne' decision maker
    }
    personeTotali += persone.length;

    // 2a. organico per funzione
    if (persone.length) {
      const listaSpecifica = FUNZIONI_PER_ARCHETIPO[c.archetipo] || [];
      const righe = [];
      for (const p of persone) {
        const titolo = p.title || '(senza titolo)';
        const cls = classificaFunzione(titolo, listaSpecifica, c.archetipo);
        if (!cls) continue;
        righe.push({ company_id: c.id, apollo_person_id: p.id, titolo_originale: titolo.slice(0, 300), livello: cls.livello, funzione: cls.funzione, archetipo: cls.archetipo, ambito: classificaAmbito(titolo), sede: estraeSede(titolo) });
      }
      push(`  organico: ${persone.length} persone, ${righe.length} classificate`);
      if (apply && righe.length) workforceScritte += await scriviWorkforce(righe);
      // Conteggio Italia riusato dalla stessa ricerca, non una chiamata a parte.
      if (apply && !c.dipendenti) await supabase.from('companies').update({ dipendenti: persone.length }).eq('id', c.id);
    }

    // 2b. decision maker — dentro la STESSA lista, mai una ricerca a parte
    if (!dmTentate.has(c.id)) {
      const trovato = trovaDecisionMaker(persone);
      if (!trovato) {
        push(`  decision maker: nessuno trovato in questa lista`);
        if (apply) await registraDecisionMaker(c.id, 'nessun_dato', 'nessun HR/TA ne\' C-level nella lista persone gia\' scaricata');
      } else if (apply) {
        try {
          const rivelato = await rivelaPersona(trovato.persona.id);
          if (rivelato?.email) {
            const esistenti = await supabase.from('company_contacts').select('id,email').eq('company_id', c.id);
            const giaPresente = (esistenti.data || []).some((x) => x.email && x.email.toLowerCase() === rivelato.email.toLowerCase());
            if (!giaPresente) {
              await supabase.from('company_contacts').insert([{ company_id: c.id, nome: rivelato.name || null, ruolo: rivelato.title || null, email: rivelato.email, linkedin_url: rivelato.linkedin_url || null, fonte_scoperta: `Apollo.io (raccolta unificata, ${trovato.categoria})`, verificato: rivelato.email_status === 'verified' }]);
              dmScritti++;
              push(`  decision maker: ${rivelato.name} — ${rivelato.title} (${trovato.categoria})`);
            } else push(`  decision maker: ${rivelato.name} — gia' presente`);
            await registraDecisionMaker(c.id, 'con_dato', `${rivelato.name} — ${rivelato.title}`);
          } else {
            await registraDecisionMaker(c.id, 'nessun_dato', 'trovato ma nessuna email rivelabile');
          }
        } catch (e) {
          if (e.message === 'CREDITI_ESAURITI') { dmCreditiEsauriti++; push(`  decision maker: crediti esauriti, salto (si ritenta quando tornano)`); }
          else { errori++; push(`  decision maker ERRORE: ${e.message}`); }
        }
      }
    }

    if (apply) await new Promise((ok) => setTimeout(ok, 400));
  }

  const summary = { candidati: candidati.length, org_arricchite: orgArricchite, org_crediti_esauriti: orgCreditiEsauriti, workforce_scritte: workforceScritte, persone_totali: personeTotali, decision_maker_scritti: dmScritti, dm_crediti_esauriti: dmCreditiEsauriti, errori, timeBudgetExceeded };
  push(`📊 RISULTATO: ${JSON.stringify(summary)}`);
  return { summary, log };
}

export { runUnificatoDailyBatch };
const isCLI = process.argv[1] && process.argv[1].includes('apollo-unificato-giornaliero.mjs');
if (isCLI) {
  runUnificatoDailyBatch(APPLY).catch((e) => { console.error('❌ ERRORE TOP-LEVEL:', e.message); process.exit(1); });
}
