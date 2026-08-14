import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase
    .from('job_listings')
    .select('id, ral_min, ral_max')
    .eq('job_title', 'Medical Science Liaison, North Italy')
    .eq('company_name', 'Argenx');

  for (const j of data) {
    const avg = (j.ral_min + j.ral_max) / 2; // 76000 -> >=45k
    const value = avg >= 45000 ? 'senior_specialist' : 'specialist';
    await supabase.from('job_listings').update({ seniority_v2: value }).eq('id', j.id);
    console.log(`✅ Aggiornato a "${value}" (RAL media €${avg})`);
  }
}
run();
