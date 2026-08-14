import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🔧 CORREZIONE: Direttore/Direttrice di Farmacia → healthcare_services\n');

  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, functional_area_v2')
    .or('job_title.ilike.%Direttore/Direttrice%,job_title.ilike.%Direttore/trice%')
    .eq('functional_area_v2', 'general_management');

  console.log(`Trovati: ${jobs.length}`);
  for (const j of jobs) {
    await supabase.from('job_listings').update({ functional_area_v2: 'healthcare_services' }).eq('id', j.id);
  }
  console.log(`✅ Aggiornati: ${jobs.length}`);

  // Correggi anche gli alias job_aliases
  for (const alias of ['Direttore/Direttrice di Farmacia', 'Direttore/Direttrice']) {
    await supabase.from('job_aliases').update({ functional_area: 'healthcare_services' }).ilike('alias', alias);
  }
  console.log('✅ Alias corretti');
}
run();
