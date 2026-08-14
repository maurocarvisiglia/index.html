import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function apply() {
  console.log('🔧 APPLICAZIONE: Farmacista Direttore/Direttrice → general_management\n');

  const titles = [
    'Farmacista direttore',
    'Farmacista Direttore/Direttrice di Farmacia',
    'Farmacista Direttore/trice - SEREGNO',
    'Farmacista Direttore/Direttrice di Farmacia - Padernello'
  ];

  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name, functional_area_v2')
    .in('job_title', titles);

  console.log(`Trovati: ${jobs.length}/4`);

  for (const job of jobs) {
    await supabase.from('job_listings').update({ functional_area_v2: 'general_management' }).eq('id', job.id);
    console.log(`✅ "${job.job_title}" (${job.company_name}) → general_management`);
  }

  console.log('\n📊 STATO FINALE...');
  const { count: totalJobs } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
  const { count: withFA } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('functional_area_v2', 'is', null);
  console.log(`   Con functional_area_v2: ${withFA}/${totalJobs} (${((withFA/totalJobs)*100).toFixed(1)}%)`);
}

apply();
