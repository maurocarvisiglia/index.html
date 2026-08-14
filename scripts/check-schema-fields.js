import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  console.log('🔎 SCHEMA COMPLETO job_listings + stato campo "sectors"\n');
  console.log('═'.repeat(80));

  // Get one full row to see all columns
  const { data: sample } = await supabase.from('job_listings').select('*').limit(1);
  console.log('\nColonne disponibili in job_listings:');
  console.log(Object.keys(sample[0]).join(', '));

  // Check "sectors" column state
  console.log('\n\n📊 Stato colonna "sectors" (se esiste)...');
  const { data: sectorsData, error: sectorsErr } = await supabase
    .from('job_listings')
    .select('id, company_name, sectors')
    .not('sectors', 'is', null)
    .limit(10);

  if (sectorsErr) {
    console.log('   ❌ Colonna non esiste o errore:', sectorsErr.message);
  } else {
    console.log(`   Record con sectors valorizzato: ${sectorsData.length} (su campione)`);
    sectorsData.forEach(s => console.log(`   - ${s.company_name}: ${s.sectors}`));
  }

  // Also check companies table for a sector-like field we might have missed
  console.log('\n\n📊 Verifica se companies ha un campo "settore" separato...');
  const { data: compSample } = await supabase.from('companies').select('*').limit(1);
  console.log('Colonne companies:', Object.keys(compSample[0]).join(', '));

  console.log('\n' + '═'.repeat(80));
}

checkSchema();
