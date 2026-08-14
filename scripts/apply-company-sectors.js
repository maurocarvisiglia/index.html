import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Classificazione approvata dall'utente — basata su informazioni pubbliche
// verificabili sul business reale di ciascuna azienda (non sul tag CSV generico).
const classifications = {
  // ALTA CONFIDENZA
  'Synlab': 'Diagnostics',
  'Patheon': 'CDMO',
  'Fortrea': 'CRO',
  'Pfizer': 'Big Pharma',
  'Boehringer Ingelheim': 'Big Pharma',
  'ICON Clinical Research': 'CRO',
  'Medpace': 'CRO',
  'Wct': 'CRO',
  'Copan': 'Diagnostics',
  'Sentinel': 'Diagnostics',
  'Cdi': 'Diagnostics',
  'Sonova': 'Medical Devices',
  'Fresenius medical care': 'Medical Devices',
  'B. Braun Avitum Italy': 'Medical Devices',
  'Nxstage': 'Medical Devices',
  'Align technology': 'Medical Devices',
  'Fujifilm': 'Medical Devices',
  'Hologic': 'Medical Devices',
  'Neodent': 'Medical Devices',
  'Cambrex': 'CDMO',
  'Althea': 'CDMO',
  'Sobi': 'Specialty Pharma',
  'Galderma': 'Specialty Pharma',
  'Guerbet': 'Specialty Pharma',
  'Beigene': 'Biotech',
  'Argenx': 'Biotech',
  'Perrigo': 'Consumer Health',
  'Cooper consumer health': 'Consumer Health',
  'Revello': 'Cosmetics',
  'La saponaria': 'Cosmetics',
  'Vetagri': 'Veterinary',
  'Lamberti': 'Chimico',
  'Bozzetto group': 'Chimico',
  'Kerakoll': 'Altro',
  'Slb': 'Altro',
  'Ecosafety': 'EHS/HSE Consulting',
  'Rpn Group': 'Consulenza',
  'Nephrocare': 'Healthcare Services',
  'Casa della salute': 'Healthcare Services',
  'Insparya hair medical clinic italy': 'Healthcare Services',
  'Alptraumaclinic': 'Healthcare Services',
  'Clinica baviera': 'Healthcare Services',
  'Centro oculistico cagliari': 'Healthcare Services',
  'Poliambulatorio san matteo': 'Healthcare Services',
  'Imsmi': 'Healthcare Services',
  'Telethon': 'Altro',
  "Opera della provvidenza sant'antonio": 'Altro',
  'La farmacia': 'Farmacia/Retail',
  'Farmacia ghiselli': 'Farmacia/Retail',
  'Lafarmacia.alconsiglio': 'Farmacia/Retail',
  'Bio logica parafarmacia': 'Farmacia/Retail',
  // MEDIA CONFIDENZA (approvate)
  'Bm farmaceutici': 'Pharma',
  'Fresenius kabi': 'Pharma',
  'SUN PHARMA ITALIA': 'Pharma',
  'Phoenix pharma italia': 'Farmacia/Retail',
  'Gapmed': 'Healthcare Services',
  'Delama': 'Altro',
  'Regina verde': 'Altro',
  'Aquarius consulting': 'Consulenza'
  // Le restanti 17 aziende a bassa confidenza NON sono in questa mappa:
  // Nte process, A2, Reamed, Studio bianchini, Dr. feel, Smartcig, Dyrecta lab,
  // Advera, Gea soluzioni, La struttura, Studio bonamico e farina, GENIUM,
  // Agaton, Theras group, Centro dioli, Itelte
  // → restano NULL, nessun dato pubblico sufficiente per classificarle.
};

async function applyCompanySectors() {
  console.log('🔧 APPLICAZIONE CLASSIFICAZIONE APPROVATA (companies.sector_v2)\n');
  console.log('═'.repeat(80));

  try {
    // 1. Get company IDs by name
    console.log('\n1️⃣  RISOLUZIONE NOMI → ID AZIENDA...');
    const names = Object.keys(classifications);
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, sector_v2')
      .in('name', names);

    console.log(`   Trovate ${companies.length}/${names.length} aziende per nome esatto`);

    const foundNames = new Set(companies.map(c => c.name));
    const notFound = names.filter(n => !foundNames.has(n));
    if (notFound.length > 0) {
      console.log(`   ⚠️  Non trovate per nome esatto: ${notFound.join(', ')}`);
    }

    // 2. Update companies.sector_v2
    console.log('\n2️⃣  AGGIORNAMENTO companies.sector_v2...');
    let updated = 0;
    for (const company of companies) {
      const newSector = classifications[company.name];
      if (company.sector_v2) {
        console.log(`   ⚠️  "${company.name}" ha già sector_v2="${company.sector_v2}", salto (non sovrascrivo dati esistenti)`);
        continue;
      }
      const { error } = await supabase
        .from('companies')
        .update({ sector_v2: newSector })
        .eq('id', company.id);

      if (error) {
        console.log(`   ❌ Errore su "${company.name}": ${error.message}`);
      } else {
        updated++;
        console.log(`   ✅ ${company.name} → ${newSector}`);
      }
    }
    console.log(`\n   Totale aziende aggiornate: ${updated}`);

    // 3. Propagate to job_listings (only where sector_v2 is currently NULL)
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

    // 4. Final coverage
    console.log('\n4️⃣  COPERTURA FINALE...');
    const { count: totalJobs } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
    const { count: withSector } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('sector_v2', 'is', null);
    console.log(`   Annunci totali: ${totalJobs}`);
    console.log(`   Con sector_v2: ${withSector} (${((withSector/totalJobs)*100).toFixed(1)}%)`);
    console.log(`   Ancora NULL (aziende non classificabili con certezza): ${totalJobs - withSector}`);

    console.log('\n' + '═'.repeat(80));
    console.log('\n✨ Fatto — nessun valore inventato, solo classificazioni approvate.\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error);
  }
}

applyCompanySectors();
