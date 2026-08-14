import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyCataloging() {
  console.log('📋 VERIFYING JOB LISTINGS CATALOGING\n');
  console.log('═'.repeat(80));

  try {
    // 1. TOTAL COUNT
    console.log('\n1️⃣  TOTAL RECORDS...');
    const { count: totalCount } = await supabase
      .from('job_listings')
      .select('*', { count: 'exact', head: true });
    console.log(`   ✅ Total job listings: ${totalCount}`);

    // 2. FIELD COMPLETENESS
    console.log('\n2️⃣  FIELD COMPLETENESS ANALYSIS...');
    const { data: jobs } = await supabase
      .from('job_listings')
      .select('*')
      .limit(5000);

    const fields = {
      'id': 0,
      'company_id': 0,
      'title': 0,
      'source_url': 0,
      'created_at': 0,
      'published_date': 0,
      'status': 0,
      'location_city': 0,
      'location_province': 0,
      'location_region': 0,
      'contract_type': 0,
      'work_hours': 0,
      'salary_annual': 0,
      'remote_work': 0,
      'benefits': 0,
      'experience_level': 0,
      'job_category': 0,
      'languages': 0,
      'sectors': 0,
      'company_name': 0,
      'ragione_sociale': 0,
      'functional_area_v2': 0,
      'therapeutic_area': 0,
      'seniority_v2': 0
    };

    jobs.forEach(job => {
      Object.keys(fields).forEach(field => {
        if (job[field] !== null && job[field] !== undefined && job[field] !== '') {
          fields[field]++;
        }
      });
    });

    console.log('\n   Field coverage (% of records):');
    const sorted = Object.entries(fields)
      .sort((a, b) => b[1] - a[1])
      .map(([field, count]) => {
        const pct = ((count / jobs.length) * 100).toFixed(1);
        const status = pct > 80 ? '✅' : pct > 50 ? '⚠️ ' : '❌';
        return { field, count, pct, status };
      });

    sorted.forEach(({ field, pct, status }) => {
      console.log(`   ${status} ${field.padEnd(25)} ${pct.padStart(6)}%`);
    });

    // 3. COMPANY LINKS
    console.log('\n3️⃣  COMPANY RELATIONSHIP VERIFICATION...');
    const { count: withCompanyId } = await supabase
      .from('job_listings')
      .select('*', { count: 'exact', head: true })
      .not('company_id', 'is', null);

    const { count: orphaned } = await supabase
      .from('job_listings')
      .select('*', { count: 'exact', head: true })
      .is('company_id', null);

    console.log(`   ✅ With company_id: ${withCompanyId}`);
    console.log(`   ❌ Orphaned (no company): ${orphaned}`);

    // 4. DUPLICATES
    console.log('\n4️⃣  DUPLICATE DETECTION...');
    const { data: dupeCheck } = await supabase
      .from('job_listings')
      .select('title, company_id, count(*) as cnt')
      .group_by('title', 'company_id')
      .gt('count', 1)
      .limit(20);

    if (dupeCheck && dupeCheck.length > 0) {
      console.log(`   ⚠️  Found ${dupeCheck.length} potential duplicates:`);
      dupeCheck.slice(0, 10).forEach(dup => {
        console.log(`      "${dup.title.substring(0, 40)}" x${dup.cnt}`);
      });
    } else {
      console.log(`   ✅ No significant duplicates found`);
    }

    // 5. SECTOR/CATEGORY DISTRIBUTION
    console.log('\n5️⃣  SECTOR DISTRIBUTION...');
    const { data: sectors } = await supabase
      .from('job_listings')
      .select('sectors')
      .not('sectors', 'is', null)
      .limit(1000);

    const sectorMap = {};
    sectors.forEach(job => {
      if (job.sectors) {
        try {
          const parsed = JSON.parse(job.sectors);
          if (Array.isArray(parsed)) {
            parsed.forEach(s => {
              sectorMap[s] = (sectorMap[s] || 0) + 1;
            });
          }
        } catch (e) {}
      }
    });

    if (Object.keys(sectorMap).length > 0) {
      console.log('\n   Top sectors:');
      Object.entries(sectorMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([sector, count]) => {
          console.log(`   - ${sector}: ${count}`);
        });
    } else {
      console.log('   ⚠️  No sector data found');
    }

    // 6. STATUS DISTRIBUTION
    console.log('\n6️⃣  STATUS DISTRIBUTION...');
    const statuses = {};
    jobs.forEach(job => {
      const status = job.status || 'unknown';
      statuses[status] = (statuses[status] || 0) + 1;
    });

    Object.entries(statuses)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => {
        const pct = ((count / jobs.length) * 100).toFixed(1);
        console.log(`   - ${status}: ${count} (${pct}%)`);
      });

    // 7. SALARY DATA
    console.log('\n7️⃣  SALARY DATA COVERAGE...');
    const withSalary = jobs.filter(j => j.salary_annual && j.salary_annual > 0).length;
    const avgSalary = jobs
      .filter(j => j.salary_annual && j.salary_annual > 0)
      .reduce((sum, j) => sum + j.salary_annual, 0) / Math.max(withSalary, 1);

    console.log(`   ✅ Jobs with salary: ${withSalary} (${((withSalary / jobs.length) * 100).toFixed(1)}%)`);
    if (withSalary > 0) {
      console.log(`   💰 Average salary: €${(avgSalary / 1000).toFixed(0)}k`);
    }

    // 8. RECENT IMPORTS
    console.log('\n8️⃣  RECENT IMPORTS...');
    const { data: recent } = await supabase
      .from('job_listings')
      .select('id, title, created_at, published_date, status')
      .order('created_at', { ascending: false })
      .limit(10);

    console.log('\n   Last 10 imported:');
    recent?.forEach((job, i) => {
      const created = new Date(job.created_at).toLocaleDateString('it-IT');
      const published = job.published_date ? new Date(job.published_date).toLocaleDateString('it-IT') : 'N/A';
      console.log(`   ${String(i+1).padStart(2)}. "${job.title.substring(0, 35)}"`);
      console.log(`       Created: ${created} | Published: ${published}`);
    });

    console.log('\n' + '═'.repeat(80));
    console.log('\n📊 SUMMARY:');
    console.log(`   Total records: ${totalCount}`);
    console.log(`   With company link: ${withCompanyId}`);
    console.log(`   Orphaned: ${orphaned}`);
    console.log(`   With salary data: ${withSalary}`);
    console.log(`   Sectors cataloged: ${Object.keys(sectorMap).length}`);

    if (orphaned > 0 || Object.keys(sectorMap).length === 0) {
      console.log('\n⚠️  ACTION REQUIRED:');
      if (orphaned > 0) console.log(`   - Fix ${orphaned} orphaned records (missing company_id)`);
      if (Object.keys(sectorMap).length === 0) console.log('   - Populate sector/category data');
    } else {
      console.log('\n✅ CATALOGING LOOKS GOOD!');
    }

    console.log('');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

verifyCataloging();
