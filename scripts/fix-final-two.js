import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // 1. Fix Field Clinical Specialist
  const { data: fcs } = await supabase.from('job_listings').select('id').eq('functional_area_v2', 'pharma');
  for (const j of fcs) {
    await supabase.from('job_listings').update({ functional_area_v2: 'commercial' }).eq('id', j.id);
  }
  console.log(`✅ "Field Clinical Specialist" corretto: ${fcs.length} record → commercial`);

  const { data: exAlias } = await supabase.from('job_aliases').select('id').ilike('alias', 'Field Clinical Specialist%');
  if (!exAlias || !exAlias.length) {
    await supabase.from('job_aliases').insert({
      alias: 'Field Clinical Specialist, Cardiac Rhythm Management',
      canonical_role: 'Field Service Engineer', role_family: 'commercial', functional_area: 'commercial'
    });
    console.log('✅ Alias aggiunto');
  }

  // 2. Delete "Addetto alla ristorazione"
  const { data: rist } = await supabase.from('job_listings').select('id, company_name').ilike('job_title', 'Addetto alla ristorazione');
  for (const j of rist) {
    await supabase.from('job_listings').delete().eq('id', j.id);
    console.log(`✅ Eliminato "Addetto alla ristorazione" (${j.company_name})`);
  }

  // Final check
  const { count: totalJobs } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
  const { count: withFA } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('functional_area_v2', 'is', null);
  console.log(`\n📊 Stato finale: ${withFA}/${totalJobs} con functional_area_v2 (${((withFA/totalJobs)*100).toFixed(1)}%)`);
}
run();
