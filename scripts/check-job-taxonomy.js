import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  console.log('🔎 TABELLE job_taxonomy E job_aliases\n');
  console.log('═'.repeat(80));

  const { count: taxCount } = await supabase.from('job_taxonomy').select('*', { count: 'exact', head: true });
  const { count: aliasCount } = await supabase.from('job_aliases').select('*', { count: 'exact', head: true });

  console.log(`\njob_taxonomy: ${taxCount} righe`);
  console.log(`job_aliases: ${aliasCount} righe`);

  console.log('\n📋 CAMPIONE job_taxonomy (30 righe)...');
  const { data: tax } = await supabase.from('job_taxonomy').select('*').limit(30);
  tax?.forEach(t => console.log(`   canonical_role="${t.canonical_role}" role_family="${t.role_family}" functional_area="${t.functional_area}"`));

  console.log('\n📋 CAMPIONE job_aliases (30 righe)...');
  const { data: aliases } = await supabase.from('job_aliases').select('*').limit(30);
  aliases?.forEach(a => console.log(`   alias="${a.alias}" → canonical_role="${a.canonical_role}" role_family="${a.role_family}" functional_area="${a.functional_area}"`));

  console.log('\n📋 Colonne complete job_taxonomy:', Object.keys(tax?.[0] || {}).join(', '));
  console.log('📋 Colonne complete job_aliases:', Object.keys(aliases?.[0] || {}).join(', '));

  // Cerca "farmacista" negli alias
  console.log('\n🔎 Ricerca "farmacista" in job_aliases...');
  const { data: farmAlias } = await supabase.from('job_aliases').select('*').ilike('alias', '%farmacist%');
  farmAlias?.forEach(a => console.log(`   alias="${a.alias}" → canonical_role="${a.canonical_role}" role_family="${a.role_family}" functional_area="${a.functional_area}"`));

  console.log('\n🔎 Ricerca "farmacista" in job_taxonomy (canonical_role)...');
  const { data: farmTax } = await supabase.from('job_taxonomy').select('*').ilike('canonical_role', '%farmacist%');
  farmTax?.forEach(t => console.log(`   canonical_role="${t.canonical_role}" role_family="${t.role_family}" functional_area="${t.functional_area}"`));
}

check();
