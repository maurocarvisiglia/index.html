import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name, functional_area_v2')
    .is('seniority_v2', null);

  console.log(`Totale senza seniority_v2: ${jobs.length}\n`);

  const byFA = new Map();
  jobs.forEach(j => {
    const v = j.functional_area_v2 || 'NULL';
    byFA.set(v, (byFA.get(v) || 0) + 1);
  });

  console.log('Per functional_area_v2 (ordine decrescente):');
  Array.from(byFA.entries()).sort((a,b) => b[1]-a[1]).forEach(([v,c]) => console.log(`   ${v.padEnd(22)} ${c}`));

  const topFA = Array.from(byFA.entries()).sort((a,b) => b[1]-a[1])[0][0];
  console.log(`\n📋 Campione titoli della categoria più numerosa ("${topFA}")...`);
  const distinct = [...new Set(jobs.filter(j => (j.functional_area_v2||'NULL') === topFA).map(j => j.job_title))];
  console.log(`Titoli distinti: ${distinct.length}\n`);
  distinct.slice(0, 60).forEach(t => console.log(`   "${t}"`));
}
run();
