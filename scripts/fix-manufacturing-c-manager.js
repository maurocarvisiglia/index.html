import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title')
    .eq('functional_area_v2', 'manufacturing')
    .eq('seniority_v2', 'lead');

  console.log(`Trovati con seniority_v2="lead" in manufacturing: ${jobs.length}`);
  for (const j of jobs) {
    await supabase.from('job_listings').update({ seniority_v2: 'manager' }).eq('id', j.id);
  }
  console.log(`✅ Aggiornati a "manager": ${jobs.length}`);
}
run();
