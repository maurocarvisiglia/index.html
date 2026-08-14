import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Classificazione confermata dall'utente per le aziende precedentemente
// senza informazioni pubbliche sufficienti — basata su descrizioni dirette
// fornite dall'utente (incl. codice ATECO per A2).
const classifications = {
  'Theras group': 'Medical Devices',
  'Agaton': 'Nutraceutical',
  'Smartcig': 'Altro',
  'Dyrecta lab': 'Altro',
  'Itelte': 'Altro',
  'Advera': 'Consulenza',
  'Studio bianchini': 'Consulenza',
  'Studio bonamico e farina': 'Consulenza',
  'Centro dioli': 'Healthcare Services',
  'Dr. feel': 'Healthcare Services',
  'Reamed': 'Medical Devices',
  'Nte process': 'Altro',
  'Gea soluzioni': 'Altro',
  'La struttura': 'Altro',
  'GENIUM': 'Consulenza',
  'A2': 'Consulenza'
};

async function applyRemainingSectors() {
  console.log('🔧 APPLICAZIONE CLASSIFICAZIONE FINALE (companies.sector_v2)\n');
  console.log('═'.repeat(80));

  try {
    console.log('\n1️⃣  RISOLUZIONE NOMI → ID AZIENDA...');
    const names = Object.keys(classifications);
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, sector_v2')
      .in('name', names);

    console.log(`   Trovate ${companies.length}/${names.length} aziende per nome esatto`);
    const foundNames = new Set(companies.map(c => c.name));
    const notFound = names.filter(n => !foundNames.has(n));
    if (notFound.length > 0) console.log(`   ⚠️  Non trovate: ${notFound.join(', ')}`);

    console.log('\n2️⃣  AGGIORNAMENTO companies.sector_v2...');
    let updated = 0;
    for (const company of companies) {
      const newSector = classifications[company.name];
      if (company.sector_v2) {
        console.log(`   ⚠️  "${company.name}" ha già sector_v2="${company.sector_v2}", salto`);
        continue;
      }
      const { error } = await supabase.from('companies').update({ sector_v2: newSector }).eq('id', company.id);
      if (error) {
        console.log(`   ❌ Errore su "${company.name}": ${error.message}`);
      } else {
        updated++;
        console.log(`   ✅ ${company.name} → ${newSector}`);
      }
    }
    console.log(`\n   Totale aziende aggiornate: ${updated}`);

    console.log('\n3️⃣  PROPAGAZIONE A job_listings (solo dove sector_v2 è NULL)...');
    let jobsUpdated = 0;
    for (const company of companies) {
      const newSector = classifications[company.name];
      const { data: jobs } = await supabase
        .from('job_listings')
        .select('id')
        .eq('company_id', company.id)
        .is('sector_v2', null);

      for (const job of jobs || []) {
        await supabase.from('job_listings').update({ sector_v2: newSector }).eq('id', job.id);
        jobsUpdated++;
      }
    }
    console.log(`   ✅ Annunci aggiornati: ${jobsUpdated}`);

    console.log('\n4️⃣  COPERTURA FINALE TOTALE...');
    const { count: totalJobs } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
    const { count: withSector } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('sector_v2', 'is', null);
    console.log(`   Annunci totali: ${totalJobs}`);
    console.log(`   Con sector_v2: ${withSector} (${((withSector/totalJobs)*100).toFixed(1)}%)`);
    console.log(`   Ancora NULL: ${totalJobs - withSector}`);

    // Show which companies (if any) still lack sector_v2
    const { data: stillMissingJobs } = await supabase
      .from('job_listings')
      .select('company_name')
      .is('sector_v2', null);
    if (stillMissingJobs && stillMissingJobs.length > 0) {
      const remaining = new Set(stillMissingJobs.map(j => j.company_name));
      console.log(`\n   Aziende ancora senza settore: ${[...remaining].join(', ')}`);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('\n✨ Fatto.\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error);
  }
}

applyRemainingSectors();
