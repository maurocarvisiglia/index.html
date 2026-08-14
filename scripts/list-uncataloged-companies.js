import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function listUncatalogedCompanies() {
  console.log('📋 AZIENDE SENZA sector_v2 (con annunci collegati)\n');
  console.log('═'.repeat(90));

  try {
    // 1. Get job counts per company for companies missing sector_v2
    const { data: jobs } = await supabase
      .from('job_listings')
      .select('company_id, company_name')
      .is('sector_v2', null);

    const jobCounts = new Map();
    jobs.forEach(j => {
      jobCounts.set(j.company_id, (jobCounts.get(j.company_id) || 0) + 1);
    });

    const companyIds = [...jobCounts.keys()];

    // 2. Get full company details for these
    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, ragione_sociale, website, codice_ateco, sectors, iva')
      .in('id', companyIds);

    // 3. Sort by job count desc
    const enriched = companies
      .map(c => ({ ...c, jobCount: jobCounts.get(c.id) || 0 }))
      .sort((a, b) => b.jobCount - a.jobCount);

    console.log(`\nTotale aziende senza settore: ${enriched.length}`);
    console.log(`Totale annunci coinvolti: ${jobs.length}\n`);

    console.log('─'.repeat(90));
    enriched.forEach((c, i) => {
      console.log(`\n${String(i+1).padStart(3)}. ${c.name}  (${c.jobCount} annunci)`);
      if (c.ragione_sociale) console.log(`     Ragione sociale: ${c.ragione_sociale}`);
      if (c.website) console.log(`     Website: ${c.website}`);
      if (c.codice_ateco) console.log(`     ATECO: ${c.codice_ateco}`);
      if (c.sectors) console.log(`     sectors (raw): ${c.sectors}`);
      if (!c.ragione_sociale && !c.website && !c.codice_ateco && !c.sectors) {
        console.log(`     ⚠️  Nessun dato disponibile per classificare`);
      }
    });

    console.log('\n' + '═'.repeat(90));

    // Summary of what data is available to help classify
    const withAteco = enriched.filter(c => c.codice_ateco).length;
    const withWebsite = enriched.filter(c => c.website).length;
    const withNothing = enriched.filter(c => !c.codice_ateco && !c.website && !c.sectors).length;

    console.log('\n📊 RIEPILOGO DATI DISPONIBILI PER CLASSIFICARE:');
    console.log(`   Con codice ATECO: ${withAteco}/${enriched.length}`);
    console.log(`   Con website: ${withWebsite}/${enriched.length}`);
    console.log(`   Senza alcun dato utile: ${withNothing}/${enriched.length}`);

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

listUncatalogedCompanies();
