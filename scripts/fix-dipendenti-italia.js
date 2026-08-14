import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APOLLO_KEY = process.env.APOLLO_API_KEY;

function extractDomain(website) {
  if (!website) return null;
  try {
    const url = website.match(/^https?:\/\//) ? website : 'https://' + website;
    return new URL(url).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

async function getItalyEmployeeCount(domain) {
  const res = await axios.post(
    'https://api.apollo.io/api/v1/mixed_people/api_search',
    { q_organization_domains_list: [domain], person_locations: ['Italy'], page: 1, per_page: 1 },
    { headers: { 'x-api-key': APOLLO_KEY, 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  return Number.isFinite(res.data.total_entries) ? res.data.total_entries : null;
}

async function run() {
  console.log('🔧 FIX dipendenti Italia — sostituisce il dato globale Apollo con stima Italia (People Search)\n');
  console.log('═'.repeat(90));

  // 1. Aziende dove Apollo aveva scritto "dipendenti" (dato globale contaminato)
  const { data: logs } = await supabase.from('enrichment_log').select('company_id,campi_estratti').eq('api_usata', 'apollo').eq('parsing_riuscito', true);
  const contaminatedIds = new Set(logs.filter(l => l.campi_estratti && l.campi_estratti.dipendenti).map(l => l.company_id));
  const successIds = logs.map(l => l.company_id);

  const { data: comps } = await supabase.from('companies').select('id,name,website,dipendenti').in('id', successIds);

  // Target: contaminate (da sostituire) + quelle con dipendenti ancora NULL (da stimare)
  const targets = comps.filter(c => contaminatedIds.has(c.id) || !c.dipendenti);
  console.log(`Aziende da correggere/stimare: ${targets.length}\n`);

  let fixed = 0, noData = 0, errors = 0;
  for (const c of targets) {
    const domain = extractDomain(c.website);
    if (!domain) { noData++; console.log(`   ⬜ "${c.name}" — nessun dominio disponibile`); continue; }
    try {
      const italyCount = await getItalyEmployeeCount(domain);
      const wasGlobal = contaminatedIds.has(c.id) ? ` (era ${c.dipendenti}, dato globale)` : ' (era NULL)';
      if (italyCount != null) {
        await supabase.from('companies').update({ dipendenti: italyCount }).eq('id', c.id);
        fixed++;
        console.log(`   ✅ "${c.name}" → ${italyCount} dipendenti Italia${wasGlobal}`);
      } else {
        noData++;
        console.log(`   ⬜ "${c.name}" — nessun dato Italia disponibile${wasGlobal}`);
      }
    } catch (e) {
      errors++;
      console.log(`   ❌ "${c.name}" — errore: ${e.response?.status || ''} ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n' + '═'.repeat(90));
  console.log(`📊 RISULTATO: ${targets.length} tentate | ${fixed} corrette | ${noData} senza dato | ${errors} errori`);
}
run();
