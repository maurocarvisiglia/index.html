import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function recatalogSectors() {
  console.log('🔧 RICATALOGAZIONE job_listings.sector_v2 DA companies.sector_v2\n');
  console.log('   Regola: NESSUNA invenzione. Si copia solo il valore reale già');
  console.log('   presente sulla scheda azienda. Se l\'azienda non ha un settore');
  console.log('   noto, il campo resta NULL.\n');
  console.log('═'.repeat(80));

  try {
    // 1. Load all job_listings with company_id (need company link to propagate sector)
    console.log('\n1️⃣  CARICAMENTO ANNUNCI CON sector_v2 MANCANTE...');
    const { data: jobsMissing, error: jobsErr } = await supabase
      .from('job_listings')
      .select('id, company_id, company_name, sector_v2')
      .is('sector_v2', null);

    if (jobsErr) throw jobsErr;
    console.log(`   Trovati: ${jobsMissing.length} annunci senza sector_v2`);

    const missingNoCompany = jobsMissing.filter(j => !j.company_id);
    console.log(`   Di cui senza company_id: ${missingNoCompany.length} (impossibile propagare, resteranno NULL)`);

    // 2. Load all companies with their sector_v2
    console.log('\n2️⃣  CARICAMENTO SETTORI AZIENDE...');
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, sector_v2');

    const companySectorMap = new Map();
    companies.forEach(c => companySectorMap.set(c.id, c.sector_v2));
    console.log(`   ✅ ${companies.length} aziende caricate`);

    // 3. For each job missing sector_v2, look up company's sector_v2
    console.log('\n3️⃣  PROPAGAZIONE SETTORE DA AZIENDA AD ANNUNCIO...');
    let updated = 0;
    let noCompanySector = 0;
    let noCompanyLink = 0;
    const noSectorCompanies = new Set();

    for (const job of jobsMissing) {
      if (!job.company_id) {
        noCompanyLink++;
        continue;
      }

      const companySector = companySectorMap.get(job.company_id);

      if (!companySector) {
        noCompanySector++;
        noSectorCompanies.add(job.company_name);
        continue; // NON INVENTARE: lascia NULL
      }

      const { error } = await supabase
        .from('job_listings')
        .update({ sector_v2: companySector })
        .eq('id', job.id);

      if (!error) {
        updated++;
        if (updated % 50 === 0) process.stdout.write(`\r   Progresso: ${updated}`);
      }
    }

    console.log(`\r   ✅ Aggiornati: ${updated}`);
    console.log(`   ⚪ Senza company_id (non propagabile): ${noCompanyLink}`);
    console.log(`   ⚪ Azienda senza settore noto (resta NULL, non inventato): ${noCompanySector}`);

    if (noSectorCompanies.size > 0) {
      console.log(`\n   Aziende senza settore noto (${noSectorCompanies.size} distinte), es.:`);
      Array.from(noSectorCompanies).slice(0, 20).forEach(c => console.log(`      - ${c}`));
    }

    // 4. Consistency check: jobs where sector_v2 DIFFERS from their company's sector_v2
    // (could indicate a job wrongly linked, or a legitimate multi-sector case — report only, don't touch)
    console.log('\n4️⃣  CONTROLLO COERENZA (annunci con sector_v2 diverso da quello azienda)...');
    const { data: allJobs } = await supabase
      .from('job_listings')
      .select('id, company_id, company_name, sector_v2')
      .not('sector_v2', 'is', null)
      .not('company_id', 'is', null);

    let mismatches = 0;
    const mismatchExamples = [];
    allJobs.forEach(job => {
      const companySector = companySectorMap.get(job.company_id);
      if (companySector && companySector !== job.sector_v2) {
        mismatches++;
        if (mismatchExamples.length < 15) {
          mismatchExamples.push({ company: job.company_name, jobSector: job.sector_v2, companySector });
        }
      }
    });

    console.log(`   Trovate ${mismatches} discrepanze (annuncio vs azienda) su ${allJobs.length} annunci con settore`);
    if (mismatchExamples.length > 0) {
      console.log('\n   Esempi (NON modificati automaticamente, solo segnalati):');
      mismatchExamples.forEach(m => {
        console.log(`      ${m.company}: annuncio="${m.jobSector}" vs azienda="${m.companySector}"`);
      });
    }

    // 5. Final coverage report
    console.log('\n5️⃣  COPERTURA FINALE...');
    const { count: totalJobs } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
    const { count: withSector } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('sector_v2', 'is', null);
    console.log(`   Annunci totali: ${totalJobs}`);
    console.log(`   Con sector_v2 valorizzato: ${withSector} (${((withSector/totalJobs)*100).toFixed(1)}%)`);
    console.log(`   Senza sector_v2 (azienda ignota, correttamente NULL): ${totalJobs - withSector}`);

    console.log('\n' + '═'.repeat(80));
    console.log('\n✨ Ricatalogazione completata — nessun valore inventato.\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error);
  }
}

recatalogSectors();
