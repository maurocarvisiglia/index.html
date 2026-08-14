import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function findBestMatchScore(csvName, dbCompanies) {
  const csvLower = csvName.toLowerCase();
  const csvWords = csvLower.split(/\s+/);

  const matches = dbCompanies.map(db => {
    const dbLower = db.name.toLowerCase();
    const dbWords = dbLower.split(/\s+/);

    const commonWords = csvWords.filter(w => dbWords.includes(w)).length;
    const wordSimilarity = commonWords / Math.max(csvWords.length, dbWords.length);

    const distance = levenshteinDistance(csvLower, dbLower);
    const maxLen = Math.max(csvLower.length, dbLower.length);
    const stringSimilarity = (maxLen - distance) / maxLen;

    const score = (wordSimilarity * 0.4) + (stringSimilarity * 0.6);

    return {
      id: db.id,
      name: db.name,
      score: score * 100
    };
  });

  return matches.sort((a, b) => b.score - a.score)[0];
}

async function finalImport() {
  console.log('🚀 FINAL COMPREHENSIVE IMPORT\n');
  console.log('═'.repeat(80));

  try {
    // 1. Read CSV
    console.log('\n1️⃣  READING CSV...');
    let csvContent = fs.readFileSync('C:\\Users\\Utente\\Downloads\\vocations-positions-1786438474.csv', 'utf-8');
    if (csvContent.charCodeAt(0) === 0xFEFF) {
      csvContent = csvContent.slice(1);
    }
    const records = parse(csvContent, {
      delimiter: ';',
      columns: true,
      skip_empty_lines: true
    });
    console.log(`   ✅ Loaded ${records.length} records`);

    // 2. Get all DB companies
    console.log('\n2️⃣  LOADING DATABASE COMPANIES...');
    const { data: dbCompanies } = await supabase
      .from('companies')
      .select('id, name');
    console.log(`   ✅ Loaded ${dbCompanies.length} companies from DB`);

    // 3. Classify CSV companies
    console.log('\n3️⃣  CLASSIFYING CSV COMPANIES...');
    const csvCompaniesMap = new Map();
    const exactMatches = new Map();
    const partialMatches = new Map();
    const newCompanies = [];

    records.forEach(r => {
      const name = r['Nome azienda']?.trim();
      if (name) csvCompaniesMap.set(name, true);
    });

    for (const csvName of csvCompaniesMap.keys()) {
      const csvLower = csvName.toLowerCase();

      // Check exact match
      const exactMatch = dbCompanies.find(db => db.name.toLowerCase() === csvLower);
      if (exactMatch) {
        exactMatches.set(csvName, exactMatch.id);
        continue;
      }

      // Check partial match (>75%)
      const bestMatch = findBestMatchScore(csvName, dbCompanies);
      if (bestMatch.score >= 75) {
        partialMatches.set(csvName, bestMatch.id);
        console.log(`   🔗 "${csvName}" → "${bestMatch.name}" (${bestMatch.score.toFixed(1)}%)`);
        continue;
      }

      // New company
      newCompanies.push({
        csv_name: csvName,
        ...extractCompanyData(csvName, records)
      });
    }

    console.log(`\n   Summary:`);
    console.log(`   - Exact matches: ${exactMatches.size}`);
    console.log(`   - Partial matches (75%+): ${partialMatches.size}`);
    console.log(`   - New companies: ${newCompanies.length}`);

    // 4. Import new companies
    console.log('\n4️⃣  IMPORTING NEW COMPANIES...');
    const newCompanyIds = new Map();

    for (const company of newCompanies) {
      const { csv_name, ...companyData } = company;

      const { data: inserted, error } = await supabase
        .from('companies')
        .insert(companyData)
        .select('id');

      if (inserted && inserted.length > 0) {
        newCompanyIds.set(csv_name, inserted[0].id);
      }

      if (error) {
        console.log(`   ⚠️  Failed to insert "${csv_name}": ${error.message}`);
      }
    }

    console.log(`   ✅ Inserted ${newCompanyIds.size} new companies`);

    // 5. Build final company mapping
    const finalMapping = new Map();
    exactMatches.forEach((id, name) => finalMapping.set(name, id));
    partialMatches.forEach((id, name) => finalMapping.set(name, id));
    newCompanyIds.forEach((id, name) => finalMapping.set(name, id));

    // 6. Import all job listings
    console.log('\n5️⃣  IMPORTING ALL JOB LISTINGS...');

    const sectorMap = {
      'pharmaceutical': 'pharma',
      'medical': 'medical_devices',
      'healthHygiene': 'health_safety',
      'biomedical': 'biotech',
      'consumerGoods': 'consumer_goods',
      'environmentSustainabilityEcology': 'sustainability',
      'retail': 'retail',
      'chemical': 'chemicals',
      'multiservices': 'services',
      'manufacturingIndustrial': 'manufacturing',
      'designFashion': 'design',
      'consultingITConsulting': 'consulting',
      'technologyScienceData': 'tech_data',
      'cybersecurityIT': 'it_security',
      'food': 'food_beverage',
      'securitySurveillance': 'security',
      'trade': 'commerce',
      'energyOilGas': 'energy',
      'industrialEngineeringServices': 'engineering',
      'outsourcingBusinessServices': 'bpo',
      'publicEntitiesNonProfitPublicAdmin': 'public_sector'
    };

    let jobsInserted = 0;
    let jobsSkipped = 0;

    for (const record of records) {
      const companyName = record['Nome azienda']?.trim();
      const companyId = finalMapping.get(companyName);

      if (!companyId) {
        jobsSkipped++;
        continue;
      }

      let sectors = [];
      if (record['Settori']) {
        record['Settori'].split(',').forEach(s => {
          const mapped = sectorMap[s.trim()];
          if (mapped) sectors.push(mapped);
        });
      }

      const jobData = {
        company_id: companyId,
        title: record['Nome posizione']?.trim() || null,
        source_url: record['URL']?.trim() || null,
        created_at: record['Data creazione']?.trim() || null,
        status: record['Stato posizione']?.trim() || 'open',
        location_city: record['Città']?.trim() || null,
        location_province: record['Province']?.trim() || null,
        location_region: record['Regioni']?.trim() || null,
        contract_type: record['Contratto']?.trim() || null,
        work_hours: record['Orario']?.trim() || null,
        salary_annual: record['Stipendio annuo']?.trim() ? parseInt(record['Stipendio annuo']) : null,
        remote_work: record['Smart working']?.trim() || null,
        benefits: record['Benefit']?.trim() || null,
        experience_level: record['Esperienza']?.trim() || null,
        job_category: record['Collar']?.trim() || null,
        languages: record['Lingue']?.trim() || null,
        sectors: sectors.length > 0 ? JSON.stringify(sectors) : null
      };

      await supabase
        .from('job_listings')
        .insert(jobData);

      jobsInserted++;
      if (jobsInserted % 100 === 0) {
        process.stdout.write(`\r   Progress: ${jobsInserted}/${records.length}`);
      }
    }

    console.log(`\r   ✅ Inserted: ${jobsInserted} | Skipped: ${jobsSkipped}`);

    // 7. Summary
    console.log('\n' + '═'.repeat(80));
    console.log('\n📊 FINAL IMPORT SUMMARY:');
    console.log(`   Companies (new): ${newCompanyIds.size}`);
    console.log(`   Companies (updated from partial match): ${partialMatches.size}`);
    console.log(`   Total companies processed: ${csvCompaniesMap.size}`);
    console.log(`   Job listings imported: ${jobsInserted}`);
    console.log(`   Job listings skipped: ${jobsSkipped}`);
    console.log(`   Total coverage: ${(((jobsInserted) / records.length) * 100).toFixed(1)}%`);

    console.log('\n✨ IMPORT COMPLETE!\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error);
  }
}

function extractCompanyData(csvName, records) {
  const company = records.find(r => r['Nome azienda']?.trim() === csvName);

  if (!company) {
    return {
      name: csvName,
      entity_type: 'life_sciences'
    };
  }

  return {
    name: csvName,
    entity_type: 'life_sciences',
    ragione_sociale: company['Ragione sociale']?.trim() || null,
    website: company['URL azienda']?.trim() || null,
    iva: company['IVA']?.trim() || null,
    dipendenti: company['Dipendenti']?.trim() ? parseInt(company['Dipendenti']) : null
  };
}

finalImport();
