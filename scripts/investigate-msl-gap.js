import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🔎 Ricerca Istituto Ganassini e GSK/Glaxo tra gli annunci...\n');

  const { data: ganassini } = await supabase.from('job_listings').select('job_title, company_name, canonical_role, sub_area, role_family, functional_area_v2').ilike('company_name', '%ganassini%');
  console.log('ISTITUTO GANASSINI:');
  ganassini?.forEach(j => console.log(`   "${j.job_title}" — canonical=${j.canonical_role} sub_area=${j.sub_area} role_family=${j.role_family} fa=${j.functional_area_v2}`));

  const { data: gsk } = await supabase.from('job_listings').select('job_title, company_name, canonical_role, sub_area, role_family, functional_area_v2').or('company_name.ilike.%glaxo%,company_name.ilike.%gsk%,company_name.ilike.%kline%');
  console.log('\nGSK/GLAXO/KLINE:');
  gsk?.forEach(j => console.log(`   "${j.job_title}" — ${j.company_name} — canonical=${j.canonical_role} sub_area=${j.sub_area} fa=${j.functional_area_v2}`));

  console.log('\n🔎 Tutti gli annunci con canonical_role = "Medical Science Liaison"...');
  const { data: byCanonical } = await supabase.from('job_listings').select('job_title, company_name, ragione_sociale, sub_area, ral_min, ral_max, location, therapeutic_area, seniority_v2, contract_type').eq('canonical_role', 'Medical Science Liaison');
  console.log(`Trovati: ${byCanonical?.length}`);
  byCanonical?.forEach(j => console.log(`   "${j.job_title}" — ${j.company_name} — RAL ${j.ral_min}-${j.ral_max}`));

  console.log('\n🔎 Tutti gli annunci con sub_area = "msl"...');
  const { data: bySubArea } = await supabase.from('job_listings').select('job_title, company_name, canonical_role').eq('sub_area', 'msl');
  console.log(`Trovati: ${bySubArea?.length}`);
  bySubArea?.forEach(j => console.log(`   "${j.job_title}" — ${j.company_name} — canonical=${j.canonical_role}`));
}
run();
