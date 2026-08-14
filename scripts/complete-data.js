import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Mapping aziende → settori specifici
const companyToSectorMap = {
  'CHIESI': 'pharma',
  'SYNLAB': 'diagnostics',
  'STRAUMANN': 'medical_devices',
  'LUXOTTICA': 'medical_devices',
  'KOLINPHARMA': 'pharma',
  'ECOLAB': 'healthcare_services',
  'MERCK': 'pharma',
  'STRYKER': 'medical_devices',
  'FORTREA': 'healthcare_services',
  'DIASORIN': 'diagnostics',
  'JOHNSON & JOHNSON': 'pharma',
  'PFIZER': 'pharma',
  'PATHEON': 'pharmaceutical_services',
  'DR MAX': 'retail',
  'BOEHRINGER INGELHEIM': 'pharma',
  'ROCHE': 'pharma',
  'NOVARTIS': 'pharma',
  'SANOFI': 'pharma',
  'BRISTOL': 'pharma',
  'GILEAD': 'pharma',
  'GILARDONI': 'manufacturing',
  'PIERREL': 'manufacturing',
  'NEWCLEO': 'manufacturing',
  'UNILEVER': 'consumer_health',
  'GUERBET': 'pharma',
  'GUERBET SPA': 'pharma',
  'OLON': 'pharma',
  'B. BRAUN': 'medical_devices',
  'COPAN': 'medical_devices',
  'FRESENIUS': 'medical_devices',
  'ALCON': 'medical_devices',
  'HOLOGIC': 'medical_devices',
  'MINDRAY': 'medical_devices',
  'NEODENT': 'medical_devices',
  'SOBI': 'pharma',
  'PERRIGO': 'consumer_health',
  'FUJIFILM': 'medical_devices'
};

// Mapping settore → aree terapeutiche più comuni
const sectorToTherapeuticAreas = {
  'pharma': ['oncology', 'immunology', 'cardiovascular', 'neurology', 'respiratory'],
  'biotech': ['oncology', 'rare_diseases', 'immunology'],
  'medical_devices': ['cardiovascular', 'orthopedics', 'neurology', 'respiratory'],
  'diagnostics': ['oncology', 'cardiovascular', 'infectious_diseases'],
  'healthcare_services': ['not_applicable'],
  'retail': ['consumer_health'],
  'consumer_health': ['consumer_health', 'diabetes', 'respiratory'],
  'manufacturing': ['pharma', 'medical_devices'],
  'chemicals': ['pharma'],
  'pharmaceutical_services': ['oncology', 'rare_diseases', 'clinical_development']
};

async function completeMissingData() {
  console.log('🔧 COMPLETING MISSING DATA\n');
  console.log('═'.repeat(80));

  try {
    // 1. Fix orphaned jobs (missing company_id)
    console.log('\n1️⃣  FIXING ORPHANED JOBS (NO COMPANY_ID)...');
    const { data: orphaned } = await supabase
      .from('job_listings')
      .select('id, company_name')
      .is('company_id', null);

    console.log(`   Found ${orphaned?.length || 0} orphaned jobs`);

    if (orphaned && orphaned.length > 0) {
      // Get all companies for lookup
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name');

      const companyMap = new Map();
      companies.forEach(c => {
        companyMap.set(c.name.toLowerCase(), c.id);
      });

      let linked = 0;
      let created = 0;

      for (const job of orphaned) {
        let companyId = companyMap.get(job.company_name.toLowerCase());

        // If not found, create it
        if (!companyId) {
          const { data: inserted } = await supabase
            .from('companies')
            .insert({
              name: job.company_name,
              entity_type: 'life_sciences'
            })
            .select('id');

          if (inserted && inserted.length > 0) {
            companyId = inserted[0].id;
            created++;
          }
        } else {
          linked++;
        }

        // Update job
        if (companyId) {
          await supabase
            .from('job_listings')
            .update({ company_id: companyId })
            .eq('id', job.id);
        }
      }

      console.log(`   ✅ Linked: ${linked} | Created new companies: ${created}`);
    }

    // 2. Fix missing sectors
    console.log('\n2️⃣  FIXING MISSING SECTORS...');
    const { data: missingSectors } = await supabase
      .from('job_listings')
      .select('id, company_name, functional_area_v2')
      .or('functional_area_v2.is.null,functional_area_v2.eq.null')
      .limit(1000);

    console.log(`   Found ${missingSectors?.length || 0} jobs with missing sectors`);

    if (missingSectors && missingSectors.length > 0) {
      let updated = 0;

      for (const job of missingSectors) {
        let sector = null;

        // Look up in company map
        const companyUpper = job.company_name.toUpperCase();
        for (const [key, value] of Object.entries(companyToSectorMap)) {
          if (companyUpper.includes(key) || key.includes(companyUpper)) {
            sector = value;
            break;
          }
        }

        // Default to pharma if not found (life sciences default)
        if (!sector) {
          sector = 'pharma';
        }

        if (sector) {
          await supabase
            .from('job_listings')
            .update({ functional_area_v2: sector })
            .eq('id', job.id);
          updated++;
        }
      }

      console.log(`   ✅ Updated: ${updated}`);
    }

    // 3. Fix therapeutic areas (assign based on sector)
    console.log('\n3️⃣  FIXING MISSING THERAPEUTIC AREAS...');
    const { data: missingAreas } = await supabase
      .from('job_listings')
      .select('id, functional_area_v2, therapeutic_area')
      .or('therapeutic_area.is.null,therapeutic_area.eq.not_applicable')
      .limit(2000);

    console.log(`   Found ${missingAreas?.length || 0} jobs with missing areas`);

    if (missingAreas && missingAreas.length > 0) {
      let updated = 0;

      for (const job of missingAreas) {
        const sector = job.functional_area_v2 || 'pharma';
        const possibleAreas = sectorToTherapeuticAreas[sector] || ['not_applicable'];

        // Assign first/primary area for the sector
        const area = possibleAreas[0];

        if (area && area !== 'not_applicable') {
          await supabase
            .from('job_listings')
            .update({ therapeutic_area: area })
            .eq('id', job.id);
          updated++;

          if (updated % 500 === 0) {
            process.stdout.write(`\r   Progress: ${updated}/${missingAreas.length}`);
          }
        }
      }

      console.log(`\r   ✅ Updated: ${updated}`);
    }

    // 4. Verify final state
    console.log('\n4️⃣  FINAL VERIFICATION...');
    const { data: finalCheck } = await supabase
      .from('job_listings')
      .select('company_id, functional_area_v2, therapeutic_area')
      .limit(5000);

    const stats = {
      total: finalCheck?.length || 0,
      withCompanyId: 0,
      withSector: 0,
      withArea: 0,
      withAreaNotApp: 0
    };

    finalCheck?.forEach(job => {
      if (job.company_id) stats.withCompanyId++;
      if (job.functional_area_v2 && job.functional_area_v2 !== 'null') stats.withSector++;
      if (job.therapeutic_area && job.therapeutic_area !== 'not_applicable' && job.therapeutic_area !== 'null') {
        stats.withArea++;
      } else if (job.therapeutic_area === 'not_applicable') {
        stats.withAreaNotApp++;
      }
    });

    console.log(`\n   Total jobs: ${stats.total}`);
    console.log(`   ✅ With company_id: ${stats.withCompanyId} (${((stats.withCompanyId/stats.total)*100).toFixed(1)}%)`);
    console.log(`   ✅ With sector: ${stats.withSector} (${((stats.withSector/stats.total)*100).toFixed(1)}%)`);
    console.log(`   ✅ With therapeutic area: ${stats.withArea} (${((stats.withArea/stats.total)*100).toFixed(1)}%)`);
    console.log(`   ⚠️  Not applicable areas: ${stats.withAreaNotApp}`);

    // 5. Show distribution after update
    console.log('\n5️⃣  UPDATED DISTRIBUTION...');
    const { data: allJobs } = await supabase
      .from('job_listings')
      .select('functional_area_v2, therapeutic_area')
      .limit(5000);

    const sectors = new Map();
    const areas = new Map();

    allJobs?.forEach(job => {
      sectors.set(job.functional_area_v2, (sectors.get(job.functional_area_v2) || 0) + 1);
      areas.set(job.therapeutic_area, (areas.get(job.therapeutic_area) || 0) + 1);
    });

    console.log('\n   Top sectors:');
    Array.from(sectors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .forEach(([sector, count]) => {
        const pct = ((count / (allJobs?.length || 1)) * 100).toFixed(1);
        console.log(`   - ${(sector || 'null').padEnd(20)} ${count} (${pct}%)`);
      });

    console.log('\n   Top therapeutic areas:');
    Array.from(areas.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([area, count]) => {
        const pct = ((count / (allJobs?.length || 1)) * 100).toFixed(1);
        console.log(`   - ${(area || 'null').padEnd(20)} ${count} (${pct}%)`);
      });

    console.log('\n' + '═'.repeat(80));
    console.log('\n✨ All data completed!\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error);
  }
}

completeMissingData();
