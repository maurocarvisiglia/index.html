import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data } = await supabase.from('job_listings').select('*').ilike('job_title', '%Multi-Specialty%');
  data?.forEach(j => console.log(`"${j.job_title}" canonical_role=${j.canonical_role} ral=${j.ral_min}-${j.ral_max} location=${j.location}`));

  const { data: medTrend } = await supabase.from('job_listings').select('job_title,company_name,canonical_role,ral_min,ral_max').ilike('company_name', '%medical trend%');
  console.log('\nMedical Trend:', medTrend);
  const { data: galderma } = await supabase.from('job_listings').select('job_title,company_name,canonical_role,ral_min,ral_max').ilike('job_title', '%GAIN Specialist%');
  console.log('\nGAIN Specialist:', galderma);
}
run();
