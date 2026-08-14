import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name, functional_area_v2, classification_source')
    .is('canonical_role', null);

  console.log(`Totale senza canonical_role: ${jobs.length}\n`);
  jobs.slice(0, 40).forEach(j => console.log(`   "${j.job_title}" — ${j.company_name} — fa_v2=${j.functional_area_v2} source=${j.classification_source}`));
}
check();
