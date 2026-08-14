import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: pharma } = await supabase.from('job_listings').select('id, job_title, company_name').eq('functional_area_v2', 'pharma');
  console.log('Record con functional_area_v2="pharma" (corrotto):');
  pharma?.forEach(j => console.log(`   "${j.job_title}" — ${j.company_name}`));

  const { data: nullOne } = await supabase.from('job_listings').select('id, job_title, company_name, canonical_role').is('functional_area_v2', null);
  console.log('\nRecord ancora NULL:');
  nullOne?.forEach(j => console.log(`   "${j.job_title}" — ${j.company_name} — canonical_role=${j.canonical_role}`));
}
run();
