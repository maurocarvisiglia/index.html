import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase
    .from('job_listings')
    .select('job_title, company_name, seniority_v2, ral_min, ral_max, job_description')
    .eq('canonical_role', 'Medical Science Liaison')
    .in('seniority_v2', ['lead', 'specialist', 'senior_specialist']);

  const bySen = {};
  data.forEach(j => {
    if (!bySen[j.seniority_v2]) bySen[j.seniority_v2] = [];
    bySen[j.seniority_v2].push(j);
  });

  for (const [sen, jobs] of Object.entries(bySen)) {
    console.log(`\n=== ${sen.toUpperCase()} (${jobs.length}) ===`);
    jobs.sort((a,b) => (b.ral_max||0) - (a.ral_max||0)).forEach(j => {
      console.log(`  RAL ${j.ral_min}-${j.ral_max} — "${j.job_title}" — ${j.company_name}`);
    });
  }

  console.log('\n\n=== DETTAGLIO IL RECORD "LEAD" ===');
  const leadJob = bySen['lead']?.[0];
  if (leadJob) {
    console.log(`Titolo: "${leadJob.job_title}"`);
    console.log(`Azienda: ${leadJob.company_name}`);
    console.log(`Descrizione: ${(leadJob.job_description||'').substring(0,500)}`);
  }
}
run();
