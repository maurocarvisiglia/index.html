import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Map di settori per aziende note
const companyToSector = {
  'CHIESI': 'pharma',
  'SYNLAB': 'medical_devices',
  'STRAUMANN': 'medical_devices',
  'LUXOTTICA': 'medical_devices',
  'KOLINPHARMA': 'pharma',
  'ECOLAB': 'chemicals',
  'MERCK': 'pharma',
  'STRYKER': 'medical_devices',
  'FORTREA': 'services',
  'DIASORIN': 'diagnostics',
  'JOHNSON': 'pharma',
  'PFIZER': 'pharma',
  'PATHEON': 'services',
  'DR MAX': 'retail',
  'CHIESI FARMACEUTICI': 'pharma',
  'BOEHRINGER': 'pharma',
  'ROCHE': 'pharma',
  'NOVARTIS': 'pharma',
  'SANOFI': 'pharma',
  'BRISTOL': 'pharma',
  'GILEAD': 'pharma',
  'GILARDONI': 'manufacturing',
  'PIERREL': 'manufacturing',
  'NEWCLEO': 'manufacturing'
};

// Inferenza da titolo della posizione
function inferSectorFromTitle(title) {
  if (!title) return null;
  const lower = title.toLowerCase();

  if (lower.includes('medical') || lower.includes('clinical') || lower.includes('nurse')) return 'medical_devices';
  if (lower.includes('pharma') || lower.includes('drug') || lower.includes('molecule')) return 'pharma';
  if (lower.includes('sales') || lower.includes('commercial') || lower.includes('account')) return 'pharma';
  if (lower.includes('quality') || lower.includes('qc') || lower.includes('qa')) return 'pharma';
  if (lower.includes('manufacturing') || lower.includes('production') || lower.includes('plant')) return 'manufacturing';
  if (lower.includes('regulatory') || lower.includes('compliance')) return 'pharma';
  if (lower.includes('research') || lower.includes('scientist')) return 'biotech';
  if (lower.includes('supply') || lower.includes('logistics')) return 'services';

  return null;
}

// Inferenza area terapeutica da titolo
function inferTherapeuticAreaFromTitle(title) {
  if (!title) return 'not_applicable';
  const lower = title.toLowerCase();

  if (lower.includes('oncol')) return 'oncology';
  if (lower.includes('cardio')) return 'cardiovascular';
  if (lower.includes('neuro')) return 'neurology';
  if (lower.includes('diabete') || lower.includes('diabetes')) return 'metabolic';
  if (lower.includes('immun')) return 'immunology';
  if (lower.includes('rare')) return 'rare_diseases';
  if (lower.includes('respir') || lower.includes('asthma')) return 'respiratory';
  if (lower.includes('derma')) return 'dermatology';
  if (lower.includes('hemo') || lower.includes('blood')) return 'hematology';
  if (lower.includes('vaccine')) return 'vaccines';

  return 'not_applicable';
}

async function updateSectorsAndAreas() {
  console.log('🔄 UPDATING SECTORS AND THERAPEUTIC AREAS\n');
  console.log('═'.repeat(80));

  try {
    // 1. Load jobs with missing/default sectors
    console.log('\n1️⃣  LOADING JOBS WITH INCOMPLETE DATA...');
    const { data: jobs, error: jobsError } = await supabase
      .from('job_listings')
      .select('id, company_name, functional_area_v2, therapeutic_area')
      .limit(5000);

    if (jobsError) {
      throw new Error(`Failed to load jobs: ${jobsError.message}`);
    }

    if (!jobs || jobs.length === 0) {
      console.log('   ⚠️  No jobs found!');
      return;
    }

    const incomplete = jobs.filter(j =>
      j.functional_area_v2 === 'sales_management' ||
      j.therapeutic_area === 'not_applicable'
    );

    console.log(`   ✅ Found ${incomplete.length} jobs to update`);

    // 2. Update with inference
    console.log('\n2️⃣  INFERRING AND UPDATING...');
    let updated = 0;
    let skipped = 0;

    for (const job of incomplete) {
      let sector = null;
      let therapeuticArea = 'not_applicable';

      // Try company-based lookup
      if (job.company_name) {
        const companyUpper = job.company_name.toUpperCase();
        for (const [key, value] of Object.entries(companyToSector)) {
          if (companyUpper.includes(key)) {
            sector = value;
            break;
          }
        }
      }

      // Title is not available in this import, skip title-based inference
      // If not found by company, use default
      if (!sector) {
        sector = 'pharma'; // Default to pharma for life sciences
      }

      // Therapeutic area default (no title available)
      therapeuticArea = 'not_applicable';

      // Update if we have new data
      if ((sector && sector !== job.functional_area_v2) ||
          (therapeuticArea !== 'not_applicable' && therapeuticArea !== job.therapeutic_area)) {

        const updateData = {};
        if (sector) updateData.functional_area_v2 = sector;
        if (therapeuticArea !== 'not_applicable') updateData.therapeutic_area = therapeuticArea;

        const { error } = await supabase
          .from('job_listings')
          .update(updateData)
          .eq('id', job.id);

        if (error) {
          console.log(`   ⚠️  Failed to update ${job.id}: ${error.message}`);
          skipped++;
        } else {
          updated++;
          if (updated % 300 === 0) {
            process.stdout.write(`\r   Progress: ${updated}/${incomplete.length}`);
          }
        }
      } else {
        skipped++;
      }
    }

    console.log(`\r   ✅ Updated: ${updated} | Skipped: ${skipped}`);

    // 3. Verify results
    console.log('\n3️⃣  VERIFYING UPDATES...');
    const { data: verified } = await supabase
      .from('job_listings')
      .select('functional_area_v2, therapeutic_area')
      .limit(5000);

    console.log('\n   Sector distribution:');
    const sectors = new Map();
    const areas = new Map();

    for (const record of verified || []) {
      sectors.set(record.functional_area_v2, (sectors.get(record.functional_area_v2) || 0) + 1);
      areas.set(record.therapeutic_area, (areas.get(record.therapeutic_area) || 0) + 1);
    }

    Array.from(sectors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([sector, count]) => {
        console.log(`   - ${sector}: ${count}`);
      });

    console.log('\n   Therapeutic areas (top 10):');
    Array.from(areas.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([area, count]) => {
        console.log(`   - ${area}: ${count}`);
      });

    // 4. Final stats
    console.log('\n4️⃣  FIELD COMPLETENESS (AFTER UPDATE)...');
    const { data: allJobs } = await supabase
      .from('job_listings')
      .select('*')
      .limit(5000);

    let withSector = 0;
    let withArea = 0;
    let notApplicable = 0;

    allJobs.forEach(job => {
      if (job.functional_area_v2 && job.functional_area_v2 !== 'sales_management') withSector++;
      if (job.therapeutic_area && job.therapeutic_area !== 'not_applicable') {
        withArea++;
      } else if (job.therapeutic_area === 'not_applicable') {
        notApplicable++;
      }
    });

    const sectorPct = ((withSector / allJobs.length) * 100).toFixed(1);
    const areaPct = ((withArea / allJobs.length) * 100).toFixed(1);

    console.log(`   Functional area (sector): ${withSector}/${allJobs.length} (${sectorPct}%)`);
    console.log(`   Therapeutic area: ${withArea}/${allJobs.length} (${areaPct}%)`);
    console.log(`   Not applicable areas: ${notApplicable}`);

    console.log('\n' + '═'.repeat(80));
    console.log('\n✨ Update complete!\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

updateSectorsAndAreas();
