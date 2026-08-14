import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name')
    .eq('functional_area_v2', 'commercial')
    .is('seniority_v2', null);

  console.log(`Annunci commercial senza seniority_v2: ${jobs.length}\n`);
  const distinct = [...new Set(jobs.map(j => j.job_title))];
  console.log(`Titoli distinti: ${distinct.length}\n`);
  distinct.slice(0, 50).forEach(t => console.log(`   "${t}"`));

  const withManager = jobs.filter(j => /manager/i.test(j.job_title));
  console.log(`\nDi questi, quanti contengono "manager" (non dovrebbero essercene, verifica): ${withManager.length}`);
  withManager.slice(0,10).forEach(j => console.log(`   "${j.job_title}"`));
}
run();
