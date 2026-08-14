import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🔧 STEP 1: AZZERAMENTO valori corrotti sui 587 non analizzati\n');

  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name, functional_area_v2')
    .is('classification_source', null);

  console.log(`Trovati: ${jobs.length} record`);

  let nulled = 0;
  for (const job of jobs) {
    if (job.functional_area_v2 !== null) {
      await supabase.from('job_listings').update({ functional_area_v2: null }).eq('id', job.id);
      nulled++;
    }
  }
  console.log(`✅ Azzerati: ${nulled}\n`);

  console.log('🔍 STEP 2: ANALISI job_title DEI 587 (per capire se possiamo classificarli in modo affidabile)\n');
  console.log('═'.repeat(80));

  console.log('\nCampione di 40 job_title (per valutare pattern riconoscibili):\n');
  jobs.slice(0, 40).forEach((j, i) => {
    console.log(`${String(i+1).padStart(3)}. "${j.job_title}" — ${j.company_name}`);
  });

  console.log('\n' + '═'.repeat(80));
  console.log(`\nTotale titoli da classificare: ${jobs.length}`);
}

run();
