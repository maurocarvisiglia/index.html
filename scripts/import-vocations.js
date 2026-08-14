import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function importVocationsData() {
  console.log('🚀 Starting Vocations Data Import\n');
  console.log('═'.repeat(60));

  try {
    // 1. Read CSV
    console.log('\n1️⃣  READING CSV FILE...');
    const csvPath = 'C:\\Users\\Utente\\Downloads\\vocations-positions-1786438474.csv';
    let csvContent = fs.readFileSync(csvPath, 'utf-8');
    // Remove BOM if present
    if (csvContent.charCodeAt(0) === 0xFEFF) {
      csvContent = csvContent.slice(1);
    }
    const records = parse(csvContent, {
      delimiter: ';',
      columns: true,
      skip_empty_lines: true
    });
    console.log(`   ✅ Loaded ${records.length} records`);

    // 2. Extract unique companies
    console.log('\n2️⃣  EXTRACTING COMPANIES...');
    const companiesMap = new Map();
    records.forEach(record => {
      const name = record['Nome azienda']?.trim();
      if (name && !companiesMap.has(name)) {
        companiesMap.set(name, {
          name: name,
          ragione_sociale: record['Ragione sociale']?.trim() || null,
          website: record['URL azienda']?.trim() || null,
          iva: record['IVA']?.trim() || null,
          dipendenti: record['Dipendenti']?.trim() ? parseInt(record['Dipendenti']) : null,
          city: record['Città']?.trim() || null,
          province: record['Province']?.trim() || null,
          region: record['Regioni']?.trim() || null
        });
      }
    });
    console.log(`   ✅ Extracted ${companiesMap.size} unique companies`);

    // 3. Upsert companies
    console.log('\n3️⃣  UPSERTING COMPANIES INTO DATABASE...');
    const companies = Array.from(companiesMap.values());
    let companiesInserted = 0;
    let companiesUpdated = 0;

    for (const company of companies) {
      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .eq('name', company.name)
        .single();

      if (existing) {
        // Update existing
        await supabase
          .from('companies')
          .update({
            ragione_sociale: company.ragione_sociale,
            website: company.website,
            iva: company.iva,
            dipendenti: company.dipendenti
          })
          .eq('id', existing.id);
        companiesUpdated++;
      } else {
        // Insert new
        await supabase
          .from('companies')
          .insert({
            name: company.name,
            ragione_sociale: company.ragione_sociale,
            website: company.website,
            iva: company.iva,
            dipendenti: company.dipendenti
          });
        companiesInserted++;
      }

      // Progress indicator
      const progress = companiesInserted + companiesUpdated;
      if (progress % 10 === 0) {
        process.stdout.write(`\r   Processing: ${progress}/${companies.length}`);
      }
    }
    console.log(`\r   ✅ Inserted: ${companiesInserted} | Updated: ${companiesUpdated}`);

    // 4. Build company map for job import
    console.log('\n4️⃣  BUILDING COMPANY MAP...');
    const { data: allCompanies } = await supabase
      .from('companies')
      .select('id, name');

    const companyNameToId = new Map();
    allCompanies.forEach(c => companyNameToId.set(c.name, c.id));
    console.log(`   ✅ Loaded ${companyNameToId.size} companies from database`);

    // 5. Import job listings
    console.log('\n5️⃣  IMPORTING JOB LISTINGS...');
    let jobsInserted = 0;
    let jobsSkipped = 0;

    // Map CSV sectors to our taxonomy
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

    for (const record of records) {
      const companyName = record['Nome azienda']?.trim();
      const companyId = companyNameToId.get(companyName);

      if (!companyId) {
        jobsSkipped++;
        continue;
      }

      // Parse sectors (might be multiple)
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
        process.stdout.write(`\r   Processing: ${jobsInserted}/${records.length}`);
      }
    }
    console.log(`\r   ✅ Inserted: ${jobsInserted} | Skipped: ${jobsSkipped}`);

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('\n📊 IMPORT SUMMARY:');
    console.log(`   Companies inserted: ${companiesInserted}`);
    console.log(`   Companies updated: ${companiesUpdated}`);
    console.log(`   Job listings imported: ${jobsInserted}`);
    console.log(`   Job listings skipped: ${jobsSkipped}`);
    console.log(`   Total unique companies: ${companiesMap.size}`);
    console.log(`   Total records processed: ${records.length}`);

    console.log('\n✨ Import complete!\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  }
}

importVocationsData();
