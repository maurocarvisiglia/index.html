import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  for (const fa of ['healthcare_services', 'quality']) {
    const { data: jobs } = await supabase
      .from('job_listings')
      .select('job_title')
      .eq('functional_area_v2', fa)
      .is('seniority_v2', null);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`${fa.toUpperCase()} — ${jobs.length} annunci`);
    console.log('='.repeat(80));
    const distinct = [...new Set(jobs.map(j => j.job_title))];
    console.log(`Titoli distinti: ${distinct.length}\n`);
    distinct.forEach(t => console.log(`   "${t}"`));
  }
}
run();
