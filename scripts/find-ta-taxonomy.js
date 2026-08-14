import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const candidates = [
    'therapeutic_area_aliases', 'therapeutic_aliases', 'ta_aliases', 'ta_taxonomy',
    'therapeutic_area_taxonomy', 'therapeutic_areas', 'disease_aliases',
    'seniority_aliases', 'seniority_taxonomy', 'seniority_keywords'
  ];
  for (const t of candidates) {
    const { data, error } = await supabase.from(t).select('*').limit(5);
    if (!error && data) {
      console.log(`✅ TROVATA: "${t}" (colonne: ${Object.keys(data[0]||{}).join(', ')})`);
      data.forEach(r => console.log('   ', JSON.stringify(r)));
    } else {
      console.log(`❌ ${t}: non esiste`);
    }
  }
}
run();
