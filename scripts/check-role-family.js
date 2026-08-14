import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRoleFamily() {
  const { data: jobs } = await supabase
    .from('job_listings')
    .select('functional_area, role_family')
    .limit(5000);

  console.log('📊 VALORI DISTINTI role_family...');
  const rf = new Map();
  jobs.forEach(j => {
    const v = j.role_family || 'NULL';
    rf.set(v, (rf.get(v) || 0) + 1);
  });
  Array.from(rf.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   "${v}": ${c}`));

  console.log('\n📊 INCROCIO: quando functional_area è NULL, cosa c\'è in role_family?...');
  const missing = jobs.filter(j => !j.functional_area);
  const rf2 = new Map();
  missing.forEach(j => {
    const v = j.role_family || 'NULL';
    rf2.set(v, (rf2.get(v) || 0) + 1);
  });
  console.log(`   Record con functional_area NULL: ${missing.length}`);
  Array.from(rf2.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   "${v}": ${c}`));

  console.log('\n📊 INCROCIO: per ogni functional_area, quali role_family compaiono? (verifica coerenza mapping)...');
  const cross = new Map();
  jobs.forEach(j => {
    if (!j.functional_area) return;
    const key = j.functional_area;
    if (!cross.has(key)) cross.set(key, new Map());
    const inner = cross.get(key);
    const v = j.role_family || 'NULL';
    inner.set(v, (inner.get(v) || 0) + 1);
  });
  cross.forEach((inner, fa) => {
    const top = Array.from(inner.entries()).sort((a,b)=>b[1]-a[1]).slice(0,3);
    console.log(`   ${fa.padEnd(20)} → ${top.map(([v,c])=>`${v}(${c})`).join(', ')}`);
  });
}

checkRoleFamily();
