import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Simple Levenshtein distance
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

function findBestMatch(csvName, dbCompanies, threshold = 3) {
  const lower = csvName.toLowerCase();
  const matches = [];

  for (const [dbName, id] of dbCompanies) {
    const dbLower = dbName.toLowerCase();

    // Exact match
    if (dbLower === lower) {
      return { id, confidence: 100 };
    }

    // Contains match
    if (dbLower.includes(lower) || lower.includes(dbLower)) {
      const distance = levenshteinDistance(dbLower, lower);
      const maxLen = Math.max(dbLower.length, lower.length);
      const similarity = ((maxLen - distance) / maxLen) * 100;
      if (similarity > 70) {
        matches.push({ id, confidence: similarity, name: dbName });
      }
    }

    // Levenshtein distance
    const distance = levenshteinDistance(dbLower, lower);
    if (distance <= threshold) {
      const maxLen = Math.max(dbLower.length, lower.length);
      const similarity = ((maxLen - distance) / maxLen) * 100;
      matches.push({ id, confidence: similarity, name: dbName });
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches[0];
  }

  return null;
}

async function fuzzyMatchAndImport() {
  console.log('🔍 Fuzzy Matching Companies and Importing Jobs\n');
  console.log('═'.repeat(70));

  try {
    // Read CSV
    let csvContent = fs.readFileSync('C:\\Users\\Utente\\Downloads\\vocations-positions-1786438474.csv', 'utf-8');
    if (csvContent.charCodeAt(0) === 0xFEFF) {
      csvContent = csvContent.slice(1);
    }
    const records = parse(csvContent, {
      delimiter: ';',
      columns: true,
      skip_empty_lines: true
    });

    // Get all companies from database
    const { data: allCompanies } = await supabase
      .from('companies')
      .select('id, name');

    const dbCompaniesMap = new Map();
    allCompanies.forEach(c => dbCompaniesMap.set(c.name, c.id));

    // Find unmatched companies and try fuzzy matching
    const unmatchedByCSV = new Set();
    records.forEach(r => {
      const name = r['Nome azienda']?.trim();
      if (name && !dbCompaniesMap.has(name)) {
        unmatchedByCSV.add(name);
      }
    });

    console.log('\n1️⃣  FUZZY MATCHING UNMATCHED COMPANIES...');
    console.log(`   Starting with ${unmatchedByCSV.size} unmatched companies\n`);

    const fuzzyMatches = new Map();
    let matched = 0;
    let unmatched = 0;

    for (const csvName of unmatchedByCSV) {
      const bestMatch = findBestMatch(csvName, dbCompaniesMap, 3);
      if (bestMatch && bestMatch.confidence >= 70) {
        fuzzyMatches.set(csvName, bestMatch.id);
        console.log(`   ✅ "${csvName}" → "${bestMatch.name}" (${bestMatch.confidence.toFixed(1)}%)`);
        matched++;
      } else {
        unmatched++;
      }
    }

    console.log(`\n   Matched: ${matched} | Still unmatched: ${unmatched}`);

    // Now import jobs with fuzzy matching
    console.log('\n2️⃣  IMPORTING JOBS WITH FUZZY MATCHING...');

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
      let companyId = dbCompaniesMap.get(companyName);

      // Try fuzzy match if not found
      if (!companyId && fuzzyMatches.has(companyName)) {
        companyId = fuzzyMatches.get(companyName);
      }

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
      if (jobsInserted % 50 === 0) {
        process.stdout.write(`\r   Progress: ${jobsInserted}/${records.length}`);
      }
    }

    console.log(`\r   ✅ Inserted: ${jobsInserted} | Skipped: ${jobsSkipped}`);

    console.log('\n' + '═'.repeat(70));
    console.log('\n📊 FINAL SUMMARY:');
    console.log(`   Companies fuzzy-matched: ${matched}`);
    console.log(`   Companies still unmatched: ${unmatched}`);
    console.log(`   Job listings imported: ${jobsInserted}`);
    console.log(`   Job listings skipped: ${jobsSkipped}`);

    console.log('\n✨ Fuzzy import complete!\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
  }
}

fuzzyMatchAndImport();
