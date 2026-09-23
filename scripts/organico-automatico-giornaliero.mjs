/**
 * ORGANICO PER FUNZIONE · automazione giornaliera
 * =============================================================================
 *   node scripts/organico-automatico-giornaliero.mjs               misura (12 aziende)
 *   node scripts/organico-automatico-giornaliero.mjs --apply       scrive
 *   node scripts/organico-automatico-giornaliero.mjs --apply --n=8 quantita' diversa
 *
 * Sceglie ogni giorno le aziende attive piu' grandi (per dipendenti) che:
 *   1. hanno un sito (serve il dominio per interrogare Apollo)
 *   2. non sono ancora in company_workforce
 *   3. non sono gia' state tentate (anche con 0 risultati) - vedi il registro
 *   4. hanno un sector_v2 mappato su uno degli 8 archetipi
 *
 * Sui 3 archetipi calibrati (farma_commerciale, medical_device_diagnostics,
 * produzione_cdmo_chimico, vedi scripts/importa-organico*.mjs) classifica a due
 * livelli. Sugli altri 5 (cro, consumer_nutraceutical_cosmetics, digital_health,
 * servizi_sanitari_farmacia, consulenza) usa solo la tassonomia UNIVERSALE finche'
 * non vengono calibrati su dati reali — non forziamo pattern non verificati.
 *
 * REGISTRO TENTATIVI — su company_facts_lookup_log (tipo='organico_apollo'), non
 * su file locale. Fino al 23/09/2026 viveva in dati-passate/organico-tentativi.json,
 * ma quel file e' sul filesystem effimero di Vercel: ad ogni invocazione del cron
 * sarebbe ripartito da zero, ritentando in eterno le stesse aziende e (soprattutto)
 * senza mai fermarsi su quelle a zero risultati. Spostato sul database, stesso
 * registro gia' usato da core-recupero-gratuito.mjs e famiglia.
 *
 * TIME_BUDGET_MS — aggiunto il 23/09/2026 per lo stesso motivo documentato in
 * apollo-enrichment-agent.js: un'azienda grande da sola (fino a 15 pagine da 100
 * persone, es. Eurospin con 2.729 persone dichiarate) puo' avvicinarsi da sola al
 * limite di 60s di una funzione serverless Vercel. N_OGGI resta un tetto
 * ottimistico di partenza; il vero limite e' il tempo.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APOLLO_KEY = process.env.APOLLO_API_KEY;
const REGISTRO_TIPO = 'organico_apollo';
const TIME_BUDGET_MS = 45000;

const argN = (process.argv.find((a) => a.startsWith('--n=')) || '').slice(4);
const N_OGGI = Number(process.env.ORGANICO_DAILY_LIMIT || argN || 12);
const APPLY = process.argv.includes('--apply');

/**
 * Il limite Apollo e' 50 chiamate/minuto: un'azienda grande da sola (fino a 15
 * pagine, vedi cap sotto) puo' quasi esaurirlo, facendo scattare 429 sulle
 * aziende successive nello stesso minuto. Ritenta con attesa invece di
 * arrendersi subito - altrimenti lo script segna quelle aziende come "tentate"
 * (vedi il registro sotto) e non le rivede piu', anche se Apollo le aveva
 * semplicemente rimandate di un minuto.
 */
async function paginaApollo(dominio, n, tentativo = 1) {
  const r = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
    method: 'POST',
    headers: { 'x-api-key': APOLLO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q_organization_domains_list: [dominio], person_locations: ['Italy'], page: n, per_page: 100 }),
  });
  if (r.status === 429 && tentativo <= 3) {
    console.log(`  429 (rate limit), attendo 65s e riprovo (${tentativo}/3)`);
    await new Promise((ok) => setTimeout(ok, 65000));
    return paginaApollo(dominio, n, tentativo + 1);
  }
  if (r.status === 402 || r.status === 422) throw new Error('CREDITI_ESAURITI: ' + (await r.text()).slice(0, 200));
  if (!r.ok) throw new Error(`Apollo HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function estraeDominio(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '') || null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// sector_v2 -> archetipo. Verificato sui 21 valori reali presenti in LS
// Intelligence (31/08). "Altro", sector vuoto e "Veterinary" restano fuori:
// il primo per eterogeneita' reale, gli altri due per mancanza di verifica —
// non si forza una struttura non controllata (principio concordato il 27/08).
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

// ─────────────────────────────────────────────────────────────────────────────
// UNIVERSALE — identico a scripts/importa-organico.mjs (calibrato 31/08).
// ─────────────────────────────────────────────────────────────────────────────
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

// Livello 2 — solo i 3 archetipi calibrati su dati reali (27-31/08).
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
const FUNZIONI_PER_ARCHETIPO = {
  farma_commerciale: FARMA_COMMERCIALE,
  medical_device_diagnostics: MEDICAL_DEVICE_DIAGNOSTICS,
  produzione_cdmo_chimico: PRODUZIONE_CDMO_CHIMICO,
};

const PAROLE_SOVRANAZIONALI = /\bemea\b|\bglobal\b|western europe|southwest europe|southern europe|\beurasia\b|\biberia\b|\bnordics?\b|\bdach\b|\bbenelux\b|\bcee\b|\beurope\b(?!an)|international/i;
const PAESI = /\b(italy|italia|greece|israel|spain|portugal|france|switzerland|austria|germany|uk|turkey|poland|balkans|latam|india|anz|japan)\b/gi;
function classificaAmbito(titolo) {
  const paesi = new Set((titolo.match(PAESI) || []).map((p) => p.toLowerCase()));
  if (PAROLE_SOVRANAZIONALI.test(titolo)) return /\bglobal\b/i.test(titolo) ? 'globale' : 'emea';
  if (paesi.size >= 2) return 'emea';
  return 'locale';
}
function estraeSede(titolo) {
  const m = titolo.match(/([A-Z][a-zà-ù]+)\s+Site\b/);
  return m ? m[1] : null;
}
function classificaFunzione(titolo, listaSpecifica, archetipo) {
  for (const [funzione, re] of listaSpecifica) if (re.test(titolo)) return { livello: 'specifico', funzione, archetipo };
  for (const [funzione, re] of UNIVERSALE) if (re.test(titolo)) return { livello: 'universale', funzione, archetipo: null };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// scriviLotti/chiaveOrganico — stesso principio della famiglia CORE: dedup sulla
// chiave di conflitto (company_id, apollo_person_id) prima di ON CONFLICT.
// ─────────────────────────────────────────────────────────────────────────────
function unici(righe) {
  const visti = new Set();
  return righe.filter((r) => {
    const k = `${r.company_id}|${r.apollo_person_id}`;
    if (visti.has(k)) return false;
    visti.add(k);
    return true;
  });
}
async function scriviWorkforce(righe) {
  const puliti = unici(righe);
  let scritte = 0;
  for (let i = 0; i < puliti.length; i += 100) {
    const lotto = puliti.slice(i, i + 100);
    const { error } = await supabase.from('company_workforce').upsert(lotto, { onConflict: 'company_id,apollo_person_id' });
    if (!error) { scritte += lotto.length; continue; }
    for (const r of lotto) {
      const { error: e2 } = await supabase.from('company_workforce').upsert([r], { onConflict: 'company_id,apollo_person_id' });
      if (!e2) scritte++;
    }
  }
  return scritte;
}

async function registra(companyId, esito, note) {
  try {
    await supabase.from('company_facts_lookup_log')
      .upsert({ company_id: companyId, tipo: REGISTRO_TIPO, esito, note: note ? String(note).slice(0, 200) : null }, { onConflict: 'company_id,tipo' });
  } catch { /* volutamente silenzioso, come nel resto della famiglia */ }
}

async function runOrganicoDailyBatch() {
  const log = [];
  const push = (msg) => { console.log(msg); log.push(msg); };

  push(`\nOrganico automatico · fino a ${N_OGGI} aziende  ${APPLY ? 'SCRIVE' : 'solo misura'}\n`);

  const { data: tentateRows, error: tentateErr } = await supabase.from('company_facts_lookup_log').select('company_id').eq('tipo', REGISTRO_TIPO);
  if (tentateErr) throw new Error('lettura registro tentativi fallita: ' + tentateErr.message);
  const tentate = new Set((tentateRows || []).map((r) => r.company_id));

  const { data: catalogateRows, error: catErr } = await supabase.from('company_workforce').select('company_id');
  if (catErr) throw new Error('lettura company_workforce fallita: ' + catErr.message);
  const giaCatalogate = new Set((catalogateRows || []).map((r) => r.company_id));

  // Tetto alzato da 2000 a 6000 il 23/09/2026: con 2000 lo script si fermava da
  // solo (candidati scelti: 0) mentre restavano ~1.259 aziende idonee mai
  // raggiunte, non per un limite Apollo ma per questa sola query — l'endpoint
  // di ricerca usato qui (mixed_people/api_search) non consuma crediti del
  // piano, solo il tetto di frequenza giornaliero di Apollo, quindi non c'e'
  // motivo di auto-limitarsi sotto l'universo reale di aziende idonee.
  const { data: pool, error: poolErr } = await supabase.from('companies')
    .select('id,name,website,sector_v2,dipendenti')
    .eq('is_active', true).is('merged_into', null).not('website', 'is', null)
    .order('dipendenti', { ascending: false, nullsFirst: false }).limit(6000);
  if (poolErr) throw new Error('lettura companies fallita: ' + poolErr.message);

  const candidati = [];
  for (const c of pool || []) {
    if (candidati.length >= N_OGGI) break;
    if (giaCatalogate.has(c.id) || tentate.has(c.id)) continue;
    const archetipo = SETTORE_ARCHETIPO[c.sector_v2];
    if (!archetipo) continue;
    const dominio = estraeDominio(c.website);
    if (!dominio) continue;
    candidati.push({ ...c, archetipo, dominio });
  }

  push(`candidati scelti: ${candidati.length} (pool attivo con sito: ${(pool || []).length}, gia' catalogate: ${giaCatalogate.size}, gia' tentate: ${tentate.size})\n`);

  const startTime = Date.now();
  let aziende = 0, persone_tot = 0, classificate_tot = 0, errori = 0, timeBudgetExceeded = false;

  for (const c of candidati) {
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      timeBudgetExceeded = true;
      push(`⏱️  Budget di tempo esaurito (${TIME_BUDGET_MS / 1000}s) — mi fermo qui, riprende al prossimo run.`);
      break;
    }
    push(`${'='.repeat(70)}\n${c.name} (${c.sector_v2} -> ${c.archetipo}) · ${c.dominio}\n${'='.repeat(70)}`);
    let persone = [];
    try {
      let pag = 1;
      while (true) {
        const d = await paginaApollo(c.dominio, pag);
        persone.push(...(d.people || []));
        if (pag === 1) push(`Apollo dichiara ${d.total_entries} persone in Italia`);
        if (!d.people || d.people.length < 100 || persone.length >= d.total_entries || pag >= 15) break;
        pag++;
        if (Date.now() - startTime > TIME_BUDGET_MS) break; // non iniziare un'altra pagina fuori budget
        await new Promise((ok) => setTimeout(ok, 400));
      }
    } catch (e) {
      errori++;
      push(`  ERRORE Apollo: ${e.message}`);
      if (/CREDITI_ESAURITI/.test(e.message)) {
        push('🛑 Interruzione batch: crediti Apollo esauriti per il ciclo di fatturazione.');
        break; // sistemico: non ha senso tentare le altre aziende del lotto
      }
      await registra(c.id, 'errore', e.message);
      continue;
    }

    const listaSpecifica = FUNZIONI_PER_ARCHETIPO[c.archetipo] || [];
    const righe = [];
    for (const p of persone) {
      const titolo = p.title || '(senza titolo)';
      const cls = classificaFunzione(titolo, listaSpecifica, c.archetipo);
      if (!cls) continue;
      righe.push({
        company_id: c.id, apollo_person_id: p.id, titolo_originale: titolo.slice(0, 300),
        livello: cls.livello, funzione: cls.funzione, archetipo: cls.archetipo,
        ambito: classificaAmbito(titolo), sede: estraeSede(titolo),
      });
    }
    push(`persone: ${persone.length}, classificate: ${righe.length}`);
    persone_tot += persone.length; classificate_tot += righe.length;

    if (!persone.length) {
      await registra(c.id, 'nessun_dato', 'zero_risultati_apollo per ' + c.dominio);
      continue;
    }
    if (!APPLY) continue;

    const scritte = await scriviWorkforce(righe);
    push(`scritte ${scritte} righe`);
    aziende++;
    await registra(c.id, 'con_dato', `${persone.length} persone, ${righe.length} classificate`);
    await new Promise((ok) => setTimeout(ok, 500));
  }

  const summary = { candidati: candidati.length, aziende_catalogate: aziende, persone_totali: persone_tot, classificate_totali: classificate_tot, errori, timeBudgetExceeded };
  push(`📊 RISULTATO: ${JSON.stringify(summary)}`);
  return { summary, log };
}

export { runOrganicoDailyBatch };

const isCLI = process.argv[1] && process.argv[1].includes('organico-automatico-giornaliero.mjs');
if (isCLI) {
  runOrganicoDailyBatch().catch((e) => {
    console.error('❌ ERRORE TOP-LEVEL:', e.message);
    process.exit(1);
  });
}
