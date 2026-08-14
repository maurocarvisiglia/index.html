import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Replica esatta di calcAllRalRanges() in index.html
const RAL_COEFFS = {
  'internship':        { lo: 0.90, hi: 1.10 },
  'entry_level':       { lo: 0.90, hi: 1.10 },
  'associate':         { lo: 0.88, hi: 1.12 },
  'specialist':        { lo: 0.88, hi: 1.12 },
  'senior_specialist': { lo: 0.88, hi: 1.12 },
  'manager':           { lo: 0.85, hi: 1.15 },
  'senior_manager':    { lo: 0.85, hi: 1.15 },
  'lead':              { lo: 0.85, hi: 1.15 },
  'director':          { lo: 0.83, hi: 1.17 },
  'senior_director':   { lo: 0.83, hi: 1.17 },
  'head_of':           { lo: 0.83, hi: 1.17 },
  'vp':                { lo: 0.83, hi: 1.17 },
  'c_level':           { lo: 0.83, hi: 1.17 },
};
const round500 = v => Math.round(v / 500) * 500;
const parseRALStr = str => {
  if (!str || str === 'N/A') return null;
  const s = str.replace(/[€\s.]/g, '').toUpperCase();
  if (s.includes('K')) { const n = parseFloat(s.replace('K', '')) * 1000; return n >= 10000 && n <= 500000 ? Math.round(n) : null; }
  const n = parseInt(s); return n && n >= 10000 && n <= 500000 ? n : null;
};

async function run() {
  console.log('🔧 RICALCOLO ral_min/ral_max DIFFERENZIATO PER SENIORITY\n');
  console.log('═'.repeat(80));

  const { data: listings } = await supabase
    .from('job_listings')
    .select('id, salary_text, seniority_v2, ral_min, ral_max')
    .not('salary_text', 'is', null);

  console.log(`Annunci con salary_text: ${listings.length}`);

  let updated = 0, skipped = 0, unchanged = 0;
  for (const l of listings) {
    const median = parseRALStr(l.salary_text);
    if (!median) { skipped++; continue; }

    const coeff = RAL_COEFFS[l.seniority_v2] || { lo: 0.85, hi: 1.15 };
    const ral_min = round500(median * coeff.lo);
    const ral_max = round500(median * coeff.hi);

    if (ral_min === l.ral_min && ral_max === l.ral_max) { unchanged++; continue; }

    await supabase.from('job_listings').update({ ral_min, ral_max, ral_estimated: true }).eq('id', l.id);
    updated++;
  }

  console.log(`\n✅ Aggiornati (range ricalcolato): ${updated}`);
  console.log(`⚪ Invariati (range già corretto): ${unchanged}`);
  console.log(`⚪ Saltati (salary_text non parsabile): ${skipped}`);

  console.log('\n📊 Verifica campione post-ricalcolo...');
  const { data: sample } = await supabase
    .from('job_listings')
    .select('salary_text, ral_min, ral_max, seniority_v2')
    .not('seniority_v2', 'is', null)
    .not('salary_text', 'is', null)
    .limit(15);
  sample?.forEach(s => console.log(`   ${s.seniority_v2.padEnd(18)} salary_text="${s.salary_text}" → €${s.ral_min}-${s.ral_max}`));

  console.log('\n' + '═'.repeat(80));
}

run();
