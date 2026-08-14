import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: jobs } = await supabase
    .from('job_listings')
    .select('job_title, company_name')
    .is('functional_area_v2', null);

  const map = new Map();
  jobs.forEach(j => {
    if (!map.has(j.job_title)) map.set(j.job_title, { company: j.company_name, count: 0 });
    map.get(j.job_title).count++;
  });

  const arr = Array.from(map.entries()).sort((a,b) => b[1].count - a[1].count);
  console.log(`Titoli distinti: ${arr.length}\n`);
  arr.forEach(([title, data], i) => {
    console.log(`${String(i+1).padStart(3)}. [${data.count}x] "${title}" — ${data.company}`);
  });
}
run();
