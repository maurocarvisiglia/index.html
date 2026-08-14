import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findRecentClassification() {
  console.log('🔎 RICERCA CATALOGAZIONE PIÙ RECENTE E DETTAGLIATA\n');
  console.log('═'.repeat(80));

  // 1. Check classification_source breakdown by date to find newest/different batch
  console.log('\n1️⃣  classification_source PER DATA (cerco batch più recenti/diversi)...');
  const { data: jobs } = await supabase
    .from('job_listings')
    .select('classification_source, classified_at, ai_analyzed, functional_area, canonical_role, role_family, sub_area, job_title, company_name')
    .order('classified_at', { ascending: false })
    .limit(3000);

  const byDate = new Map();
  jobs.forEach(j => {
    const d = j.classified_at ? j.classified_at.substring(0,10) : 'NULL';
    const key = `${d} | ${j.classification_source || 'NULL'}`;
    byDate.set(key, (byDate.get(key) || 0) + 1);
  });
  Array.from(byDate.entries()).sort().reverse().forEach(([k,c]) => console.log(`   ${k}: ${c}`));

  // 2. Show most recently classified records in full detail
  console.log('\n2️⃣  RECORD PIÙ RECENTI (classified_at più alto) — dettaglio completo...');
  const mostRecent = jobs.filter(j => j.classified_at).slice(0, 10);
  mostRecent.forEach(j => {
    console.log(`\n   "${j.job_title}" — ${j.company_name}`);
    console.log(`   classified_at: ${j.classified_at} | source: ${j.classification_source} | ai_analyzed: ${j.ai_analyzed}`);
    console.log(`   functional_area: ${j.functional_area} | canonical_role: ${j.canonical_role} | role_family: ${j.role_family} | sub_area: ${j.sub_area}`);
  });

  // 3. ai_analyzed distribution
  console.log('\n3️⃣  DISTRIBUZIONE ai_analyzed...');
  const aiMap = new Map();
  jobs.forEach(j => {
    const v = String(j.ai_analyzed);
    aiMap.set(v, (aiMap.get(v) || 0) + 1);
  });
  aiMap.forEach((c,v) => console.log(`   ${v}: ${c}`));

  // 4. Search for other tables that might hold a more detailed taxonomy
  console.log('\n4️⃣  RICERCA ALTRE TABELLE DI CLASSIFICAZIONE...');
  const candidates = [
    'job_classifications', 'role_classifications', 'annunci_classificati',
    'ai_classifications', 'classification_history', 'role_taxonomy_v3',
    'functional_areas_v2', 'job_roles', 'roles', 'role_taxonomy',
    'job_listings_enriched', 'job_listings_v2', 'annunci', 'listings_classification'
  ];
  for (const t of candidates) {
    const { data, error } = await supabase.from(t).select('*').limit(5);
    if (!error && data) {
      console.log(`\n   ✅ TROVATA: "${t}" (${data.length}+ righe)`);
      console.log('   Colonne:', Object.keys(data[0] || {}).join(', '));
    }
  }

  console.log('\n' + '═'.repeat(80));
}

findRecentClassification();
