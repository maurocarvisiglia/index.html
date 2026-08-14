import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCompanySectors() {
  console.log('🔎 VERIFICA companies.sectors — fonte dati reale (non inventata)\n');
  console.log('═'.repeat(80));

  // 1. How many companies have sectors populated
  const { count: total } = await supabase.from('companies').select('*', { count: 'exact', head: true });
  const { count: withSectors } = await supabase.from('companies').select('*', { count: 'exact', head: true }).not('sectors', 'is', null);
  const { count: withSectorV2 } = await supabase.from('companies').select('*', { count: 'exact', head: true }).not('sector_v2', 'is', null);
  const { count: withCompanyType } = await supabase.from('companies').select('*', { count: 'exact', head: true }).not('company_type', 'is', null);
  const { count: withAteco } = await supabase.from('companies').select('*', { count: 'exact', head: true }).not('codice_ateco', 'is', null);

  console.log(`\nTotale aziende: ${total}`);
  console.log(`Con "sectors" valorizzato: ${withSectors} (${((withSectors/total)*100).toFixed(1)}%)`);
  console.log(`Con "sector_v2" valorizzato: ${withSectorV2} (${((withSectorV2/total)*100).toFixed(1)}%)`);
  console.log(`Con "company_type" valorizzato: ${withCompanyType} (${((withCompanyType/total)*100).toFixed(1)}%)`);
  console.log(`Con "codice_ateco" valorizzato: ${withAteco} (${((withAteco/total)*100).toFixed(1)}%)`);

  // 2. Sample values
  console.log('\n📋 Esempio di valori "sectors" (companies)...');
  const { data: sample } = await supabase
    .from('companies')
    .select('name, sectors, sector_v2, company_type, codice_ateco')
    .not('sectors', 'is', null)
    .limit(15);

  sample?.forEach(c => {
    console.log(`\n   ${c.name}`);
    console.log(`     sectors: ${JSON.stringify(c.sectors)}`);
    console.log(`     sector_v2: ${c.sector_v2}`);
    console.log(`     company_type: ${c.company_type}`);
    console.log(`     codice_ateco: ${c.codice_ateco}`);
  });

  // 3. Distinct sector_v2 values (might be the official taxonomy already used elsewhere)
  console.log('\n📊 Valori distinti sector_v2 (companies)...');
  const { data: allCompanies } = await supabase.from('companies').select('sector_v2').limit(3000);
  const sv2 = new Map();
  allCompanies?.forEach(c => {
    const v = c.sector_v2 || 'NULL';
    sv2.set(v, (sv2.get(v) || 0) + 1);
  });
  Array.from(sv2.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   "${v}": ${c}`));

  // 4. Now check job_listings.sector / sector_v2 / company_industry current state
  console.log('\n\n📊 STATO ATTUALE job_listings.sector / sector_v2 / company_industry...');
  const { data: jobs } = await supabase.from('job_listings').select('sector, sector_v2, company_industry, company_id').limit(3000);

  ['sector', 'sector_v2', 'company_industry'].forEach(field => {
    const map = new Map();
    jobs.forEach(j => {
      const v = j[field] === null ? 'NULL' : j[field];
      map.set(v, (map.get(v) || 0) + 1);
    });
    console.log(`\n   ${field} (${map.size} valori distinti):`);
    Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).slice(0, 15).forEach(([v,c]) => console.log(`      "${v}": ${c}`));
  });

  console.log('\n' + '═'.repeat(80));
}

checkCompanySectors();
