import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeMissingJobs() {
  console.log('🔍 Analyzing Missing Job Listings\n');

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

    // Get all companies in database
    const { data: allCompanies } = await supabase
      .from('companies')
      .select('id, name');

    const companyNameToId = new Map();
    allCompanies.forEach(c => companyNameToId.set(c.name.toLowerCase(), c.id));

    // Find which companies in CSV have no match
    const unmatchedCompanies = new Map();
    records.forEach(record => {
      const companyName = record['Nome azienda']?.trim();
      const lowerName = companyName?.toLowerCase();
      if (!companyNameToId.has(lowerName)) {
        if (!unmatchedCompanies.has(companyName)) {
          unmatchedCompanies.set(companyName, 0);
        }
        unmatchedCompanies.set(companyName, unmatchedCompanies.get(companyName) + 1);
      }
    });

    console.log('Companies in CSV that have NO match in database:');
    console.log('═'.repeat(60) + '\n');

    const sorted = Array.from(unmatchedCompanies.entries())
      .sort((a, b) => b[1] - a[1]);

    sorted.forEach(([ name, count ], i) => {
      console.log(`${String(i+1).padStart(2)}. ${name.padEnd(40)} (${count} jobs)`);
    });

    console.log('\n' + '═'.repeat(60));
    console.log(`\nTotal unmatched companies: ${unmatchedCompanies.size}`);
    console.log(`Total unmatched jobs: ${sorted.reduce((sum, [_, count]) => sum + count, 0)}`);

    console.log('\n💡 RECOMMENDATION:');
    console.log('These companies were likely imported with DIFFERENT names.');
    console.log('We need to do a fuzzy match or manual reconciliation.');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

analyzeMissingJobs();
