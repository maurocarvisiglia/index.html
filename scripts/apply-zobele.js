import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Dimenticate per errore di trascrizione nello script apply-company-sectors.js,
// erano già nella tabella approvata mostrata all'utente (categoria Altro:
// produttore deodoranti ambientali/dispositivi anti-insetti).
const classifications = {
  'Zobele': 'Altro',
  'Zobele holding': 'Altro'
};

async function fix() {
  console.log('🔧 CORREZIONE: Zobele / Zobele Holding\n');

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, sector_v2')
    .in('name', Object.keys(classifications));

  console.log(`Trovate: ${companies.length}/2`);

  for (const company of companies) {
    if (company.sector_v2) {
      console.log(`⚠️  "${company.name}" ha già sector_v2="${company.sector_v2}", salto`);
      continue;
    }
    const newSector = classifications[company.name];
    await supabase.from('companies').update({ sector_v2: newSector }).eq('id', company.id);
    console.log(`✅ ${company.name} → ${newSector}`);

    const { data: jobs } = await supabase
      .from('job_listings')
      .select('id')
      .eq('company_id', company.id)
      .is('sector_v2', null);

    for (const job of jobs || []) {
      await supabase.from('job_listings').update({ sector_v2: newSector }).eq('id', job.id);
    }
    console.log(`   Annunci propagati: ${jobs?.length || 0}`);
  }

  const { count: totalJobs } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
  const { count: withSector } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('sector_v2', 'is', null);
  console.log(`\nCopertura finale: ${withSector}/${totalJobs} (${((withSector/totalJobs)*100).toFixed(1)}%)`);
}

fix();
