import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: jobs } = await supabase
    .from('job_listings')
    .select('functional_area_v2')
    .is('classification_source', null);

  console.log(`Record NON analizzati dalla pipeline AI: ${jobs.length}`);
  const dist = new Map();
  jobs.forEach(j => {
    const v = j.functional_area_v2 || 'NULL';
    dist.set(v, (dist.get(v) || 0) + 1);
  });
  console.log('\nValori attuali di functional_area_v2 su questi record:');
  Array.from(dist.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   "${v}": ${c}`));
}
check();
