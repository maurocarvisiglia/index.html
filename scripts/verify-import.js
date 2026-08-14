import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyImport() {
  console.log('✅ VERIFYING IMPORT\n');
  console.log('═'.repeat(70));

  try {
    // Count companies
    const { count: companiesCount } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true });

    console.log(`\n📊 Companies in database: ${companiesCount}`);

    // Count job listings
    const { count: jobsCount } = await supabase
      .from('job_listings')
      .select('*', { count: 'exact', head: true });

    console.log(`📊 Job listings in database: ${jobsCount}`);

    // Sample recent jobs
    console.log('\n🔍 Sample of recently imported jobs:');
    const { data: recentJobs } = await supabase
      .from('job_listings')
      .select('id, title, company:companies(name), created_at, status')
      .order('created_at', { ascending: false })
      .limit(10);

    recentJobs?.forEach((job, i) => {
      console.log(`\n${i+1}. ${job.title}`);
      console.log(`   Company: ${job.company?.name || 'N/A'}`);
      console.log(`   Status: ${job.status}`);
      console.log(`   Created: ${new Date(job.created_at).toLocaleDateString('it-IT')}`);
    });

    // Check for jobs without company_id
    const { count: orphanJobs } = await supabase
      .from('job_listings')
      .select('*', { count: 'exact', head: true })
      .is('company_id', null);

    console.log(`\n⚠️  Jobs without company: ${orphanJobs}`);

    // Show import statistics by company
    console.log('\n📈 Top 10 companies by job count:');
    const { data: topCompanies } = await supabase
      .rpc('get_company_job_frequency', { days: 365 })
      .limit(10);

    topCompanies?.forEach((item, i) => {
      console.log(`${String(i+1).padStart(2)}. ${item.frequency} jobs`);
    });

    console.log('\n' + '═'.repeat(70));
    console.log('✨ Verification complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

verifyImport();
