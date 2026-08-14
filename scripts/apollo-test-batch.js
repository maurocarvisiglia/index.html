import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APOLLO_KEY = process.env.APOLLO_API_KEY;

const BATCH_SIZE = 15;
const VALID_REVENUE_RANGES = ['<5M', '5-20M', '20-100M', '100-250M', '250-500M', '>500M'];

function extractDomain(website) {
  if (!website) return null;
  try {
    const url = website.match(/^https?:\/\//) ? website : 'https://' + website;
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

// Stessa logica di normalizzazione usata per il merge duplicati aziende
function normalize(name) {
  if (!name) return '';
  let n = name.toLowerCase();
  n = n.replace(/\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|s\.?t\.?p\.?|ltd|inc|italia|italy|s\.?u\.?|società|per azioni|a responsabilità limitata|unipersonale)\b/gi, '');
  n = n.replace(/[.,'’\-–—()|]/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

// Verifica che l'azienda trovata da Apollo sia plausibilmente la stessa.
// Doppio controllo: (1) token condivisi per nomi "normali", (2) forma compatta
// senza spazi per nomi/acronimi corti (es. "A.B. Chimica" == "ABchimica",
// "A.C.E.F." == "ACEF Azienda Chimica e Farmaceutica") che il confronto a
// token perderebbe perché le singole lettere vengono scartate come rumore.
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
    timeout: 15000,
  });
  return res.data.organization || null;
}

async function run() {
  console.log('🧪 TEST BATCH — Apollo.io Organization Enrichment\n');
  console.log('═'.repeat(90));

  const { data: candidates } = await supabase
    .from('companies')
    .select('id, name, website, dipendenti, fatturato_range, descrizione_aziendale, linkedin_url')
    .not('website', 'is', null)
    .order('name')
    .limit(200);

  const withDomain = candidates
    .map(c => ({ ...c, domain: extractDomain(c.website) }))
    .filter(c => c.domain);

  // Prendi un campione vario: alcune con campi già vuoti (dove Apollo può aggiungere valore)
  const offset = Number(process.env.APOLLO_TEST_OFFSET || 0);
  const sample = withDomain.slice(offset, offset + BATCH_SIZE);

  console.log(`\nAziende candidate con dominio estraibile: ${withDomain.length}`);
  console.log(`Testando le prime ${sample.length}\n`);

  let matched = 0, mismatched = 0, notFound = 0, errors = 0, updated = 0;
  const report = [];

  for (const c of sample) {
    try {
      const org = await enrichDomain(c.domain);
      if (!org) {
        notFound++;
        report.push({ name: c.name, domain: c.domain, esito: 'NON TROVATA su Apollo' });
        continue;
      }

      if (!isPlausibleMatch(c.name, org.name)) {
        mismatched++;
        report.push({ name: c.name, domain: c.domain, esito: `⚠️ MISMATCH — Apollo ha restituito "${org.name}", SALTATA` });
        continue;
      }
      matched++;

      const revenueRange = revenueToRange(org.annual_revenue);
      const patch = {};
      if (!c.dipendenti && org.estimated_num_employees) patch.dipendenti = org.estimated_num_employees;
      if (!c.fatturato_range && revenueRange) patch.fatturato_range = revenueRange;
      if (!c.descrizione_aziendale && org.short_description) patch.descrizione_aziendale = org.short_description;
      if (!c.linkedin_url && org.linkedin_url) patch.linkedin_url = org.linkedin_url;

      const filledCount = ['dipendenti', 'fatturato_range', 'descrizione_aziendale', 'linkedin_url']
        .filter(f => (patch[f] !== undefined ? true : !!c[f])).length;
      const completeness = Math.round((filledCount / 4) * 100);

      if (Object.keys(patch).length) {
        await supabase.from('companies').update({
          ...patch,
          arricchito_il: new Date().toISOString(),
          completezza_arricchimento: completeness,
        }).eq('id', c.id);

        await supabase.from('enrichment_queue').update({
          stato: 'completed',
          arricchito_il: new Date().toISOString(),
        }).eq('company_id', c.id);

        await supabase.from('enrichment_log').insert({
          company_id: c.id,
          timestamp: new Date().toISOString(),
          api_usata: 'apollo',
          risultato_grezzo: { domain: c.domain, apollo_org_id: org.id, annual_revenue: org.annual_revenue, estimated_num_employees: org.estimated_num_employees },
          parsing_riuscito: true,
          campi_estratti: patch,
        });

        updated++;
        report.push({ name: c.name, domain: c.domain, esito: `✅ AGGIORNATA: ${JSON.stringify(patch)}` });
      } else {
        report.push({ name: c.name, domain: c.domain, esito: '↔️ match OK ma nessun campo mancante da riempire' });
      }
    } catch (e) {
      errors++;
      const status = e.response?.status;
      report.push({ name: c.name, domain: c.domain, esito: `❌ ERRORE ${status || ''}: ${e.response?.data ? JSON.stringify(e.response.data).slice(0, 150) : e.message}` });
    }
    await new Promise(r => setTimeout(r, 400));
  }

  console.log('DETTAGLIO:\n');
  report.forEach(r => console.log(`   "${r.name}" (${r.domain})\n      → ${r.esito}\n`));

  console.log('═'.repeat(90));
  console.log(`📊 RISULTATO: ${sample.length} testate | ${matched} match plausibili | ${mismatched} scartate per mismatch | ${notFound} non trovate su Apollo | ${errors} errori | ${updated} aziende effettivamente aggiornate`);
  console.log('═'.repeat(90));
}
run();
