import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const THRESHOLD = 45000;

async function run() {
  console.log('🔧 CLASSIFICAZIONE seniority_v2 — healthcare_services\n');
  console.log('═'.repeat(80));

  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, ral_min, ral_max')
    .eq('functional_area_v2', 'healthcare_services')
    .is('seniority_v2', null);

  console.log(`Trovati: ${jobs.length}`);

  const dist = new Map();
  for (const j of jobs) {
    let value = 'specialist';
    if (j.ral_min && j.ral_max) {
      const avg = (j.ral_min + j.ral_max) / 2;
      if (avg >= THRESHOLD) value = 'senior_specialist';
    }
    await supabase.from('job_listings').update({ seniority_v2: value }).eq('id', j.id);
    dist.set(value, (dist.get(value) || 0) + 1);
  }

  console.log('\nDistribuzione applicata:');
  Array.from(dist.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   ${v}: ${c}`));

  console.log('\n📊 STATO FINALE seniority_v2 (globale)...');
  const { count: totalJobs } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
  const { count: withSen } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('seniority_v2', 'is', null);
  console.log(`   Con seniority_v2: ${withSen}/${totalJobs} (${((withSen/totalJobs)*100).toFixed(1)}%)`);
  console.log('\n' + '═'.repeat(80));
}
run();
