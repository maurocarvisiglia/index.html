import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function find() {
  console.log('🔎 Ricerca "Chef Di Cucina"...\n');
  const { data: chef } = await supabase.from('job_listings').select('id, job_title, company_name').ilike('job_title', '%chef%cucina%');
  chef?.forEach(j => console.log(`   id=${j.id} "${j.job_title}" — ${j.company_name}`));

  console.log('\n🔎 Ricerca titoli con "Engineer" che finiscono classificati "marketing" dal dizionario...\n');
  const { data: eng } = await supabase.from('job_listings').select('id, job_title, company_name, functional_area_v2, canonical_role, classification_source').ilike('job_title', '%engineer%');
  console.log(`Totale con "Engineer" nel titolo: ${eng.length}`);
  eng?.forEach(j => console.log(`   "${j.job_title}" — ${j.company_name} — fa_v2=${j.functional_area_v2} canonical=${j.canonical_role} source=${j.classification_source}`));
}

find();
