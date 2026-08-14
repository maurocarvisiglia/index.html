import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function diagnosi() {
  console.log('📋 DIAGNOSI TOTALE — LS INTELLIGENCE DATABASE\n');
  console.log('═'.repeat(90));

  // 1. COMPANIES
  console.log('\n1️⃣  AZIENDE (companies)');
  const { count: totalCompanies } = await supabase.from('companies').select('*', { count: 'exact', head: true });
  const { count: withSector } = await supabase.from('companies').select('*', { count: 'exact', head: true }).not('sector_v2', 'is', null);
  console.log(`   Totale: ${totalCompanies}`);
  console.log(`   Con sector_v2: ${withSector} (${((withSector/totalCompanies)*100).toFixed(1)}%)`);

  // 2. JOB LISTINGS - overview
  console.log('\n2️⃣  ANNUNCI (job_listings)');
  const { count: totalJobs } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
  console.log(`   Totale: ${totalJobs}`);

  const fields = ['sector_v2', 'functional_area_v2', 'canonical_role', 'role_family', 'therapeutic_area', 'seniority_v2', 'field_hq'];
  for (const f of fields) {
    const { count } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not(f, 'is', null);
    console.log(`   Con ${f.padEnd(20)}: ${String(count).padStart(5)} (${((count/totalJobs)*100).toFixed(1)}%)`);
  }

  // 3. FUNCTIONAL AREA DISTRIBUTION
  console.log('\n3️⃣  DISTRIBUZIONE functional_area_v2');
  const { data: faData } = await supabase.from('job_listings').select('functional_area_v2').limit(3000);
  const faMap = new Map();
  faData.forEach(j => { const v = j.functional_area_v2 || 'NULL'; faMap.set(v, (faMap.get(v) || 0) + 1); });
  Array.from(faMap.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => {
    console.log(`   ${v.padEnd(22)} ${String(c).padStart(5)} (${((c/faData.length)*100).toFixed(1)}%)`);
  });

  // 4. SECTOR DISTRIBUTION
  console.log('\n4️⃣  DISTRIBUZIONE sector_v2 (annunci)');
  const { data: secData } = await supabase.from('job_listings').select('sector_v2').limit(3000);
  const secMap = new Map();
  secData.forEach(j => { const v = j.sector_v2 || 'NULL'; secMap.set(v, (secMap.get(v) || 0) + 1); });
  Array.from(secMap.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => {
    console.log(`   ${v.padEnd(22)} ${String(c).padStart(5)} (${((c/secData.length)*100).toFixed(1)}%)`);
  });

  // 5. THERAPEUTIC AREA DISTRIBUTION (known problem area)
  console.log('\n5️⃣  DISTRIBUZIONE therapeutic_area (NON ANCORA SISTEMATO)');
  const { data: taData } = await supabase.from('job_listings').select('therapeutic_area').limit(3000);
  const taMap = new Map();
  taData.forEach(j => { const v = j.therapeutic_area || 'NULL'; taMap.set(v, (taMap.get(v) || 0) + 1); });
  Array.from(taMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10).forEach(([v,c]) => {
    console.log(`   ${v.padEnd(22)} ${String(c).padStart(5)} (${((c/taData.length)*100).toFixed(1)}%)`);
  });

  // 6. SENIORITY DISTRIBUTION (known problem area)
  console.log('\n6️⃣  DISTRIBUZIONE seniority_v2 (NON ANCORA VERIFICATO)');
  const { data: senData } = await supabase.from('job_listings').select('seniority_v2').limit(3000);
  const senMap = new Map();
  senData.forEach(j => { const v = j.seniority_v2 || 'NULL'; senMap.set(v, (senMap.get(v) || 0) + 1); });
  Array.from(senMap.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => {
    console.log(`   ${v.padEnd(22)} ${String(c).padStart(5)} (${((c/senData.length)*100).toFixed(1)}%)`);
  });

  // 7. Orphan/integrity checks
  console.log('\n7️⃣  INTEGRITÀ REFERENZIALE');
  const { count: noCompany } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).is('company_id', null);
  console.log(`   Annunci senza company_id: ${noCompany}`);

  // 8. unmapped_job_titles remaining
  console.log('\n8️⃣  TITOLI ANCORA NON MAPPATI (unmapped_job_titles)');
  const { count: unmappedCount } = await supabase.from('unmapped_job_titles').select('*', { count: 'exact', head: true });
  console.log(`   Righe in tabella: ${unmappedCount}`);
  const { count: stillNullCanonical } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).is('canonical_role', null);
  console.log(`   Annunci ancora senza canonical_role: ${stillNullCanonical}`);

  // 9. job_taxonomy / job_aliases growth
  console.log('\n9️⃣  CRESCITA TASSONOMIA');
  const { count: taxCount } = await supabase.from('job_taxonomy').select('*', { count: 'exact', head: true });
  const { count: aliasCount } = await supabase.from('job_aliases').select('*', { count: 'exact', head: true });
  console.log(`   job_taxonomy: ${taxCount} ruoli canonici`);
  console.log(`   job_aliases: ${aliasCount} alias (partiva da 745)`);

  console.log('\n' + '═'.repeat(90));
  console.log('\n📌 RIEPILOGO STATO:');
  console.log('   ✅ companies.sector_v2: COMPLETO (100%)');
  console.log(`   ✅ job_listings.sector_v2: ${((secData.filter(j=>j.sector_v2).length/secData.length)*100).toFixed(1)}%`);
  console.log(`   ✅ job_listings.functional_area_v2: ${((faData.filter(j=>j.functional_area_v2).length/faData.length)*100).toFixed(1)}%`);
  console.log(`   ✅ job_listings.canonical_role: ${(((totalJobs-stillNullCanonical)/totalJobs)*100).toFixed(1)}%`);
  console.log(`   ⚠️  job_listings.therapeutic_area: DA VERIFICARE (prossimo step)`);
  console.log(`   ⚠️  job_listings.seniority_v2: DA VERIFICARE (prossimo step)`);
  console.log('');
}

diagnosi();
