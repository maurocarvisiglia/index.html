import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.from('therapeutic_areas').select('*').order('sort_order');
  console.log(`Totale: ${data.length}\n`);
  data.forEach(t => console.log(`   ${t.code.padEnd(20)} = ${t.label}`));
}
run();
