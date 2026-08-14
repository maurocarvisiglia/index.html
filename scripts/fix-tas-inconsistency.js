import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🔧 ALLINEAMENTO "Therapeutic Area Specialist" → Medical Science Liaison\n');
  console.log('═'.repeat(80));

  // Trova tutte le varianti (Oncology, Neurology&Immunology, ecc.)
  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name, canonical_role, role_family, sub_area, functional_area_v2')
    .ilike('job_title', 'Therapeutic Area Specialist%');

  console.log(`Trovati: ${jobs.length}\n`);

  const beforeDist = new Map();
  jobs.forEach(j => beforeDist.set(j.canonical_role || 'NULL', (beforeDist.get(j.canonical_role || 'NULL')||0)+1));
  console.log('Distribuzione canonical_role PRIMA:');
  beforeDist.forEach((c,v) => console.log(`   ${v}: ${c}`));

  let updated = 0;
  for (const j of jobs) {
    const needsFix = j.canonical_role !== 'Medical Science Liaison' || j.role_family !== 'medical_affairs' || j.sub_area !== 'msl';
    if (!needsFix) continue;
    await supabase.from('job_listings').update({
      canonical_role: 'Medical Science Liaison',
      role_family: 'medical_affairs',
      sub_area: 'msl'
    }).eq('id', j.id);
    updated++;
  }
  console.log(`\n✅ Aggiornati: ${updated}`);

  // Anche Clinical Research Specialist — verifica se ce ne sono altri con classificazione diversa
  console.log('\n🔎 Verifica "Clinical Research Specialist" (altre aziende)...');
  const { data: crs } = await supabase.from('job_listings').select('id, job_title, company_name, canonical_role').ilike('job_title', 'Clinical Research Specialist%');
  crs?.forEach(j => console.log(`   "${j.job_title}" — ${j.company_name} — canonical=${j.canonical_role}`));

  console.log('\n📊 VERIFICA FINALE...');
  const { data: after } = await supabase.from('job_listings').select('canonical_role').ilike('job_title', 'Therapeutic Area Specialist%');
  const afterDist = new Map();
  after.forEach(j => afterDist.set(j.canonical_role || 'NULL', (afterDist.get(j.canonical_role||'NULL')||0)+1));
  afterDist.forEach((c,v) => console.log(`   ${v}: ${c}`));

  console.log('\n' + '═'.repeat(80));
}
run();
