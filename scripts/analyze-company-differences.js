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

async function analyzeCompanyDifferences() {
  console.log('🔎 Analyzing Company Name Differences\n');
  console.log('═'.repeat(80));

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
    const { data: dbCompanies } = await supabase
      .from('companies')
      .select('id, name');

    const dbNamesLower = dbCompanies.map(c => ({
      original: c.name,
      lower: c.name.toLowerCase(),
      words: c.name.toLowerCase().split(/\s+/)
    }));

    // Find companies in CSV not in database
    const csvCompanies = new Set();
    records.forEach(r => {
      const name = r['Nome azienda']?.trim();
      if (name) csvCompanies.add(name);
    });

    console.log('\n📊 DETAILED COMPANY MATCHING ANALYSIS\n');

    const unmatched = [];
    const partialMatches = [];
    const notFoundCompanies = [];

    for (const csvName of csvCompanies) {
      const csvLower = csvName.toLowerCase();
      const csvWords = csvLower.split(/\s+/);

      // Check exact match first
      const exactMatch = dbNamesLower.find(db => db.lower === csvLower);
      if (exactMatch) continue;

      // Find similar matches
      const similarities = dbNamesLower
        .map(db => {
          // Count common words
          const commonWords = csvWords.filter(w => db.words.includes(w)).length;
          const wordSimilarity = commonWords / Math.max(csvWords.length, db.words.length);

          // Levenshtein distance
          const distance = levenshteinDistance(csvLower, db.lower);
          const maxLen = Math.max(csvLower.length, db.lower.length);
          const stringSimilarity = (maxLen - distance) / maxLen;

          // Combined score
          const score = (wordSimilarity * 0.4) + (stringSimilarity * 0.6);

          return {
            dbName: db.original,
            csvName: csvName,
            score: score * 100,
            wordSimilarity: (wordSimilarity * 100).toFixed(1),
            stringSimilarity: (stringSimilarity * 100).toFixed(1),
            distance: distance,
            commonWords: commonWords,
            totalWords: Math.max(csvWords.length, db.words.length)
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      const bestMatch = similarities[0];

      if (bestMatch.score >= 75) {
        partialMatches.push({
          csv: csvName,
          db: bestMatch.dbName,
          score: bestMatch.score.toFixed(1),
          reason: `${bestMatch.wordSimilarity}% word match, ${bestMatch.stringSimilarity}% string match`
        });
      } else {
        unmatched.push(csvName);
        notFoundCompanies.push({
          csv: csvName,
          topSuggest: bestMatch.dbName,
          score: bestMatch.score.toFixed(1)
        });
      }
    }

    console.log(`\n✅ PARTIAL MATCHES (75%-99% similarity) - ${partialMatches.length} companies:`);
    console.log('─'.repeat(80));
    if (partialMatches.length > 0) {
      partialMatches.forEach((match, i) => {
        console.log(`${String(i+1).padStart(2)}. "${match.csv}"`);
        console.log(`   → "${match.db}" (${match.score}% - ${match.reason})`);
      });
    } else {
      console.log('   (none)');
    }

    console.log(`\n❌ NOT FOUND (0%-74% similarity) - ${unmatched.length} companies:`);
    console.log('─'.repeat(80));

    // Group by similarity
    const notFound = notFoundCompanies
      .sort((a, b) => parseFloat(b.score) - parseFloat(a.score));

    notFound.slice(0, 30).forEach((item, i) => {
      console.log(`${String(i+1).padStart(2)}. "${item.csv}"`);
      console.log(`   ~ Closest: "${item.topSuggest}" (${item.score}% match)`);
    });

    if (notFound.length > 30) {
      console.log(`\n   ... and ${notFound.length - 30} more companies not shown`);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('\n📈 STATISTICS:');
    console.log(`   Total CSV companies: ${csvCompanies.size}`);
    console.log(`   Exact matches in DB: ${csvCompanies.size - unmatched.length - partialMatches.length}`);
    console.log(`   Partial matches (75%+): ${partialMatches.length}`);
    console.log(`   Not found: ${unmatched.length}`);
    console.log(`   Coverage: ${(((csvCompanies.size - unmatched.length) / csvCompanies.size) * 100).toFixed(1)}%`);

    console.log('\n💡 RECOMMENDATION:');
    if (partialMatches.length > 0) {
      console.log(`   - ${partialMatches.length} companies can be auto-matched with >75% confidence`);
    }
    console.log(`   - ${unmatched.length} companies are completely new and need to be created`);
    console.log(`   - These are likely real companies that were NOT in the initial import\n`);

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

analyzeCompanyDifferences();
