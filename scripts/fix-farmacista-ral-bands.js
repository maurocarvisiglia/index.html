import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🔧 CORREZIONE Farmacista — fasce RAL (28-32k=entry_level, 32-38k=specialist)\n');
  console.log('═'.repeat(80));

  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, ral_min, ral_max, seniority_v2')
    .eq('functional_area_v2', 'healthcare_services')
    .ilike('job_title', '%farmacist%');

  console.log(`Trovati "Farmacista" in healthcare_services: ${jobs.length}`);

  let entryLevel = 0, specialist = 0, unchanged = 0, noRal = 0;
  for (const j of jobs) {
    if (!j.ral_min || !j.ral_max) { noRal++; continue; }
    const avg = (j.ral_min + j.ral_max) / 2;

    let value;
    if (avg < 32000) value = 'entry_level';
    else if (avg < 38000) value = 'specialist';
    else if (avg < 45000) value = 'specialist';
    else value = 'senior_specialist';

    if (value === j.seniority_v2) { unchanged++; continue; }

    await supabase.from('job_listings').update({ seniority_v2: value }).eq('id', j.id);
    if (value === 'entry_level') entryLevel++;
    else if (value === 'specialist') specialist++;
  }

  console.log(`\n✅ → entry_level: ${entryLevel}`);
  console.log(`✅ → specialist: ${specialist}`);
  console.log(`⚪ Invariati (già corretti): ${unchanged}`);
  console.log(`⚪ Senza RAL disponibile (non toccati): ${noRal}`);

  console.log('\n📊 STATO FINALE seniority_v2 (globale)...');
  const { count: totalJobs } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
  const { count: withSen } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('seniority_v2', 'is', null);
  console.log(`   Con seniority_v2: ${withSen}/${totalJobs} (${((withSen/totalJobs)*100).toFixed(1)}%)`);
  console.log('\n' + '═'.repeat(80));
}
run();
