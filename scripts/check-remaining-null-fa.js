import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name, canonical_role, role_family, classification_source, functional_area')
    .is('functional_area_v2', null);

  console.log(`Totale senza functional_area_v2: ${jobs.length}\n`);

  const bySource = new Map();
  jobs.forEach(j => {
    const s = j.classification_source || 'NULL';
    bySource.set(s, (bySource.get(s) || 0) + 1);
  });
  console.log('Per classification_source:');
  bySource.forEach((c, s) => console.log(`   ${s}: ${c}`));

  console.log('\nPer role_family (quando presente):');
  const byRF = new Map();
  jobs.forEach(j => {
    const v = j.role_family || 'NULL';
    byRF.set(v, (byRF.get(v) || 0) + 1);
  });
  Array.from(byRF.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   ${v}: ${c}`));

  console.log('\nCampione titoli distinti (max 60)...');
  const distinct = [...new Set(jobs.map(j => j.job_title))];
  distinct.slice(0, 60).forEach(t => console.log(`   "${t}"`));
  console.log(`\nTitoli distinti totali: ${distinct.length}`);
}
check();
