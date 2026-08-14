import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name, ragione_sociale, region, province, city, location, seniority_v2, ral_min, ral_max, therapeutic_area, contract_type, field_hq, published_date, sub_area, company_id')
    .eq('canonical_role', 'Medical Science Liaison');

  console.log(`Totale con canonical_role='Medical Science Liaison': ${jobs.length}\n`);
  jobs.forEach(j => console.log(`   "${j.job_title}" — ${j.company_name} — RAL ${j.ral_min}-${j.ral_max} — loc:${j.location}`));

  fs.writeFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\msl-data-correct.json', JSON.stringify(jobs, null, 2));
}
run();
