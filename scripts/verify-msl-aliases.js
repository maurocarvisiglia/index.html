import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🔎 "Clinical Research Specialist" (Ganassini)...\n');
  const { data: crs } = await supabase.from('job_listings').select('job_title, company_name, job_description, canonical_role, sub_area').ilike('job_title', '%Clinical Research Specialist%');
  crs?.forEach(j => {
    console.log(`"${j.job_title}" — ${j.company_name} — canonical=${j.canonical_role} sub_area=${j.sub_area}`);
    console.log((j.job_description || 'NESSUNA DESCRIZIONE').substring(0, 600));
    console.log('---');
  });

  console.log('\n🔎 "Therapeutic Area Specialist Oncology" (Merck)...\n');
  const { data: tas } = await supabase.from('job_listings').select('job_title, company_name, job_description, canonical_role, sub_area').ilike('job_title', '%Therapeutic Area Specialist%');
  tas?.forEach(j => {
    console.log(`"${j.job_title}" — ${j.company_name} — canonical=${j.canonical_role} sub_area=${j.sub_area}`);
    console.log((j.job_description || 'NESSUNA DESCRIZIONE').substring(0, 600));
    console.log('---');
  });

  // Controlla l'alias esatto in job_aliases
  console.log('\n🔎 Voci in job_aliases per questi titoli...\n');
  const { data: aliases } = await supabase.from('job_aliases').select('*').or('alias.ilike.%Clinical Research Specialist%,alias.ilike.%Therapeutic Area Specialist%');
  aliases?.forEach(a => console.log(`alias="${a.alias}" → canonical_role="${a.canonical_role}" role_family="${a.role_family}" functional_area="${a.functional_area}"`));
}
run();
