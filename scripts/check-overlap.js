import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkOverlap() {
  console.log('🔎 VERIFICA SOVRAPPOSIZIONE: aziende arricchite vs aziende toccate dal mio import CSV\n');
  console.log('═'.repeat(80));

  // 1. Companies with enrichment history
  const { data: enrichedCompanies } = await supabase
    .from('companies')
    .select('id, name')
    .not('arricchito_il', 'is', null);

  console.log(`\nAziende con arricchito_il valorizzato: ${enrichedCompanies?.length}`);
  const enrichedNames = new Set(enrichedCompanies?.map(c => c.name.toLowerCase().trim()) || []);

  // 2. Companies from vocations CSV (the 172 unique names I imported/updated)
  let csvContent = fs.readFileSync('C:\\Users\\Utente\\Downloads\\vocations-positions-1786438474.csv', 'utf-8');
  if (csvContent.charCodeAt(0) === 0xFEFF) csvContent = csvContent.slice(1);
  const records = parse(csvContent, { delimiter: ';', columns: true, skip_empty_lines: true });

  const csvCompanyNames = new Set();
  records.forEach(r => {
    const name = r['Nome azienda']?.trim();
    if (name) csvCompanyNames.add(name.toLowerCase());
  });

  console.log(`Aziende uniche nel CSV vocations: ${csvCompanyNames.size}`);

  // 3. Check overlap
  const overlap = [...enrichedNames].filter(n => csvCompanyNames.has(n));
  console.log(`\n⚠️  SOVRAPPOSIZIONE (aziende arricchite E presenti nel CSV che ho importato): ${overlap.length}`);
  overlap.forEach(name => console.log(`   - ${name}`));

  if (overlap.length === 0) {
    console.log('\n✅ NESSUNA SOVRAPPOSIZIONE: il mio script di import CSV (import-vocations.js)');
    console.log('   NON ha toccato nessuna delle 11 aziende con dati di arricchimento pregresso.');
    console.log('   I dati di arricchimento automatico (dove esistenti) sono INTATTI.');
  } else {
    console.log('\n❌ ATTENZIONE: queste aziende potrebbero aver subito sovrascrittura di dati di arricchimento!');
  }

  console.log('\n' + '═'.repeat(80));
}

checkOverlap();
