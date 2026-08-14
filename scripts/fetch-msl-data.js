import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🔎 Estrazione dati MSL da Supabase\n');

  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name, ragione_sociale, region, province, city, location, seniority_v2, ral_min, ral_max, therapeutic_area, contract_type, field_hq, published_date, sub_area, company_id')
    .or('canonical_role.eq.Medical Science Liaison,job_title.ilike.%medical science liaison%,job_title.ilike.%\bmsl\b%,sub_area.eq.msl');

  console.log(`Trovati (query larga): ${jobs.length}`);

  // Filtro più stretto: canonical_role esatto O titolo contiene MSL/Medical Science Liaison
  const msl = jobs.filter(j =>
    /medical science liaison|\bmsl\b/i.test(j.job_title)
  );
  console.log(`Dopo filtro titolo: ${msl.length}`);

  fs.writeFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\msl-data.json', JSON.stringify(msl, null, 2));

  console.log('\nCampione:');
  msl.slice(0, 5).forEach(j => console.log(`   "${j.job_title}" — ${j.company_name} — ${j.region || j.city || 'N/D'} — RAL ${j.ral_min}-${j.ral_max}`));
}
run();
