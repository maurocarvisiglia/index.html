import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixJobListings() {
  console.log('🔧 FIXING JOB LISTINGS FIELDS\n');
  console.log('═'.repeat(70));

  try {
    // 1. Get all job listings with company data
    console.log('\n1️⃣  LOADING JOB LISTINGS...');
    const { data: jobs, error: jobsError } = await supabase
      .from('job_listings')
      .select('id, company_id, created_at, company_name, ragione_sociale')
      .limit(2000);

    if (jobsError) throw jobsError;
    console.log(`   ✅ Loaded ${jobs.length} jobs to fix`);

    // 2. Get companies for mapping
    console.log('\n2️⃣  LOADING COMPANIES...');
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, name, ragione_sociale');

    if (companiesError) throw companiesError;

    const companyMap = new Map();
    companies.forEach(c => {
      companyMap.set(c.id, {
        name: c.name,
        ragione_sociale: c.ragione_sociale || c.name
      });
    });
    console.log(`   ✅ Loaded ${companies.length} companies`);

    // 3. Update job listings
    console.log('\n3️⃣  UPDATING JOB LISTINGS...');
    let updated = 0;
    let skipped = 0;

    for (const job of jobs) {
      const company = companyMap.get(job.company_id);
      if (!company) {
        skipped++;
        continue;
      }

      // published_date from created_at
      const publishedDate = job.created_at || new Date().toISOString();

      const { error } = await supabase
        .from('job_listings')
        .update({
          published_date: publishedDate,
          company_name: company.name,
          ragione_sociale: company.ragione_sociale,
          functional_area_v2: 'sales_management', // Default fallback
          seniority_v2: 'entry_level', // Default fallback
          therapeutic_area: 'not_applicable' // Default fallback
        })
        .eq('id', job.id);

      if (error) {
        console.log(`   ⚠️  Failed to update ${job.id}: ${error.message}`);
      } else {
        updated++;
        if (updated % 200 === 0) {
          process.stdout.write(`\r   Progress: ${updated}/${jobs.length}`);
        }
      }
    }

    console.log(`\r   ✅ Updated: ${updated} | Skipped: ${skipped}`);

    // 4. Verify
    console.log('\n4️⃣  VERIFYING UPDATES...');
    const { data: sample } = await supabase
      .from('job_listings')
      .select('id, title, company_name, ragione_sociale, published_date')
      .not('published_date', 'is', null)
      .limit(5);

    if (sample) {
      console.log('\n   Sample of updated jobs:');
      sample.forEach((job, i) => {
        console.log(`   ${i+1}. "${job.title}"`);
        console.log(`      Company: ${job.company_name}`);
        console.log(`      Published: ${new Date(job.published_date).toLocaleDateString('it-IT')}`);
      });
    }

    console.log('\n' + '═'.repeat(70));
    console.log('\n✨ Fix complete!\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

fixJobListings();
