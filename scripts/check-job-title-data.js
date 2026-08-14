import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkJobTitleData() {
  console.log('🔎 VERIFICA CAMPI REALI PER CLASSIFICARE functional_area_v2\n');
  console.log('═'.repeat(80));

  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, functional_area, functional_area_v2, canonical_role, role_family, sub_area, classification_source, classified_at, company_name')
    .limit(5000);

  const total = jobs.length;

  ['job_title', 'functional_area', 'canonical_role', 'role_family', 'sub_area', 'classification_source', 'classified_at'].forEach(field => {
    const filled = jobs.filter(j => j[field] !== null && j[field] !== '').length;
    console.log(`${field.padEnd(25)} ${filled}/${total} (${((filled/total)*100).toFixed(1)}%)`);
  });

  console.log('\n📋 CAMPIONE job_title (primi 20 valorizzati)...');
  jobs.filter(j => j.job_title).slice(0, 20).forEach(j => {
    console.log(`   "${j.job_title}" — ${j.company_name}`);
  });

  console.log('\n📋 VALORI DISTINTI functional_area (vecchio campo, non _v2)...');
  const faMap = new Map();
  jobs.forEach(j => {
    const v = j.functional_area || 'NULL';
    faMap.set(v, (faMap.get(v) || 0) + 1);
  });
  Array.from(faMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([v,c]) => console.log(`   "${v}": ${c}`));

  console.log('\n📋 VALORI DISTINTI classification_source...');
  const csMap = new Map();
  jobs.forEach(j => {
    const v = j.classification_source || 'NULL';
    csMap.set(v, (csMap.get(v) || 0) + 1);
  });
  Array.from(csMap.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   "${v}": ${c}`));

  console.log('\n📋 VALORI DISTINTI classified_at (date, raggruppate)...');
  const caMap = new Map();
  jobs.forEach(j => {
    const v = j.classified_at ? j.classified_at.substring(0,10) : 'NULL';
    caMap.set(v, (caMap.get(v) || 0) + 1);
  });
  Array.from(caMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([v,c]) => console.log(`   "${v}": ${c}`));

  console.log('\n📋 CAMPIONE canonical_role / role_family / sub_area...');
  jobs.filter(j => j.canonical_role || j.role_family || j.sub_area).slice(0, 15).forEach(j => {
    console.log(`   canonical_role="${j.canonical_role}" role_family="${j.role_family}" sub_area="${j.sub_area}" (${j.company_name})`);
  });

  console.log('\n' + '═'.repeat(80));
}

checkJobTitleData();
