import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const areas = ['supply_chain','it','rd','finance','hr','medical_affairs','business_development','clinical_operations','regulatory_affairs','marketing','customer_service','legal','drug_safety'];

  for (const fa of areas) {
    const { data: jobs } = await supabase
      .from('job_listings')
      .select('job_title, ral_min, ral_max')
      .eq('functional_area_v2', fa)
      .is('seniority_v2', null);

    if (!jobs.length) continue;
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${fa.toUpperCase()} — ${jobs.length} annunci`);
    console.log('='.repeat(80));
    jobs.forEach(j => {
      const ral = j.ral_min && j.ral_max ? `€${j.ral_min}-${j.ral_max}` : 'no RAL';
      console.log(`   "${j.job_title}" (${ral})`);
    });
  }
}
run();
