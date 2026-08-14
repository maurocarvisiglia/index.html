import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🔎 Record MSL con contract_type = "altro"\n');
  const { data: altro } = await supabase
    .from('job_listings')
    .select('job_title, company_name, contract_type, job_description, salary_text, classification_source')
    .eq('canonical_role', 'Medical Science Liaison')
    .eq('contract_type', 'altro');

  console.log(`Trovati: ${altro.length}\n`);
  altro.forEach(j => {
    console.log(`"${j.job_title}" — ${j.company_name} — fonte: ${j.classification_source}`);
    console.log((j.job_description || 'NESSUNA DESCRIZIONE').substring(0, 400));
    console.log('---');
  });

  console.log('\n🔎 Tutti i valori distinti di contract_type nel dataset (globale)...');
  const { data: all } = await supabase.from('job_listings').select('contract_type');
  const dist = new Map();
  all.forEach(j => { const v = j.contract_type || 'NULL'; dist.set(v, (dist.get(v)||0)+1); });
  Array.from(dist.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   "${v}": ${c}`));
}
run();
