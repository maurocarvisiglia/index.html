import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { count: total } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
  const { count: withSalaryText } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('salary_text', 'is', null);
  const { count: withRalMin } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('ral_min', 'is', null);
  const { count: withRalEstimated } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).eq('ral_estimated', true);

  console.log(`Totale annunci: ${total}`);
  console.log(`Con salary_text: ${withSalaryText} (${((withSalaryText/total)*100).toFixed(1)}%)`);
  console.log(`Con ral_min: ${withRalMin} (${((withRalMin/total)*100).toFixed(1)}%)`);
  console.log(`Con ral_estimated=true: ${withRalEstimated}`);

  console.log('\nCampione salary_text...');
  const { data: sample } = await supabase.from('job_listings').select('salary_text, ral_min, ral_max, ral_estimated, seniority_v2').not('salary_text', 'is', null).limit(15);
  sample?.forEach(s => console.log(`   salary_text="${s.salary_text}" ral_min=${s.ral_min} ral_max=${s.ral_max} estimated=${s.ral_estimated} seniority=${s.seniority_v2}`));

  console.log('\nCampione ral_min/max SENZA salary_text (da dove vengono?)...');
  const { data: sample2 } = await supabase.from('job_listings').select('salary_text, ral_min, ral_max, ral_estimated').is('salary_text', null).not('ral_min', 'is', null).limit(10);
  sample2?.forEach(s => console.log(`   salary_text=${s.salary_text} ral_min=${s.ral_min} ral_max=${s.ral_max} estimated=${s.ral_estimated}`));
}
run();
