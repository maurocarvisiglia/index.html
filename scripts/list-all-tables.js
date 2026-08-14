import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('📋 FUNCTIONAL_AREAS — elenco completo (16 righe)\n');
  const { data: fa } = await supabase.from('functional_areas').select('*').order('sort_order');
  fa?.forEach(f => console.log(`   ${f.code.padEnd(25)} = ${f.label}`));

  console.log('\n📋 RICERCA TABELLA GLOSSARIO SENIORITY...');
  const candidates = ['seniority_glossary','seniority_levels','seniority','livelli_seniority','role_levels'];
  for (const t of candidates) {
    const { data, error } = await supabase.from(t).select('*').limit(30);
    if (!error && data) {
      console.log(`\n   ✅ TROVATA: "${t}"`);
      console.log(JSON.stringify(data, null, 2));
    }
  }

  console.log('\n📋 ELENCO TABELLE PUBBLICHE (via information_schema, se accessibile)...');
  const { data: tables, error: tErr } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');
  if (tErr) {
    console.log('   ⚠️  Non accessibile via client REST:', tErr.message);
  } else {
    tables?.forEach(t => console.log('   - ' + t.table_name));
  }
}

main();
