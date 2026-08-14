import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  console.log('🔎 RICERCA CLASSIFICAZIONE ESISTENTE PER "FARMACISTA"\n');
  console.log('═'.repeat(80));

  const { data: jobs } = await supabase
    .from('job_listings')
    .select('*')
    .ilike('job_title', '%farmacist%')
    .limit(20);

  console.log(`\nTrovati ${jobs.length} record con "farmacist" nel titolo (campione max 20)\n`);

  jobs.forEach((j, i) => {
    console.log(`\n--- ${i+1}. "${j.job_title}" — ${j.company_name} ---`);
    console.log(`   functional_area: ${j.functional_area}`);
    console.log(`   functional_area_v2: ${j.functional_area_v2}`);
    console.log(`   canonical_role: ${j.canonical_role}`);
    console.log(`   role_family: ${j.role_family}`);
    console.log(`   sub_area: ${j.sub_area}`);
    console.log(`   sector: ${j.sector}`);
    console.log(`   sector_v2: ${j.sector_v2}`);
    console.log(`   classification_source: ${j.classification_source}`);
    console.log(`   classified_at: ${j.classified_at}`);
    console.log(`   ai_analyzed: ${j.ai_analyzed}`);
  });

  // Aggregate: what values appear for Farmacista roles across functional_area / role_family / canonical_role
  console.log('\n\n📊 AGGREGATO su tutti i "farmacist*" (non solo il campione)...');
  const { data: allFarm } = await supabase
    .from('job_listings')
    .select('functional_area, functional_area_v2, canonical_role, role_family, sub_area, classification_source')
    .ilike('job_title', '%farmacist%');

  console.log(`Totale record: ${allFarm.length}`);

  ['functional_area', 'functional_area_v2', 'canonical_role', 'role_family', 'sub_area', 'classification_source'].forEach(field => {
    const map = new Map();
    allFarm.forEach(j => {
      const v = j[field] || 'NULL';
      map.set(v, (map.get(v) || 0) + 1);
    });
    console.log(`\n${field}:`);
    Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   "${v}": ${c}`));
  });
}

check();
