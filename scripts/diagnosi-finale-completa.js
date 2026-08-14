import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function diagnosi() {
  console.log('📋 DIAGNOSI FINALE COMPLETA — LS INTELLIGENCE\n');
  console.log('═'.repeat(90));

  // 1. Copertura campi
  console.log('\n1️⃣  COPERTURA CAMPI job_listings');
  const { count: totalJobs } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
  const fields = ['sector_v2', 'functional_area_v2', 'canonical_role', 'role_family', 'therapeutic_area', 'seniority_v2', 'company_id', 'ral_min'];
  for (const f of fields) {
    const { count } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not(f, 'is', null);
    console.log(`   ${f.padEnd(20)}: ${String(count).padStart(5)}/${totalJobs} (${((count/totalJobs)*100).toFixed(1)}%)`);
  }

  // 2. Validazione valori contro tassonomie ufficiali
  console.log('\n2️⃣  VALIDAZIONE VALORI CONTRO TASSONOMIE UFFICIALI');
  const { data: officialFA } = await supabase.from('functional_areas').select('code');
  const { data: officialTA } = await supabase.from('therapeutic_areas').select('code');
  const officialFACodes = new Set(officialFA.map(f => f.code));
  const officialTACodes = new Set(officialTA.map(t => t.code));
  const validSeniority = new Set(['internship','entry_level','associate','specialist','senior_specialist','expert','principal','lead','manager','senior_manager','head_of','director','senior_director','vp','general_manager','country_manager','c_level']);

  const { data: allJobs } = await supabase.from('job_listings').select('functional_area_v2, therapeutic_area, seniority_v2');

  const invalidFA = allJobs.filter(j => j.functional_area_v2 && !officialFACodes.has(j.functional_area_v2));
  const invalidTA = allJobs.filter(j => j.therapeutic_area && !officialTACodes.has(j.therapeutic_area));
  const invalidSen = allJobs.filter(j => j.seniority_v2 && !validSeniority.has(j.seniority_v2));

  console.log(`   functional_area_v2 non validi: ${invalidFA.length}`);
  if (invalidFA.length) console.log('      Valori:', [...new Set(invalidFA.map(j=>j.functional_area_v2))]);
  console.log(`   therapeutic_area non validi: ${invalidTA.length}`);
  if (invalidTA.length) console.log('      Valori:', [...new Set(invalidTA.map(j=>j.therapeutic_area))]);
  console.log(`   seniority_v2 non validi: ${invalidSen.length}`);
  if (invalidSen.length) console.log('      Valori:', [...new Set(invalidSen.map(j=>j.seniority_v2))]);

  // 3. Distribuzione functional_area_v2
  console.log('\n3️⃣  DISTRIBUZIONE functional_area_v2');
  const faMap = new Map();
  allJobs.forEach(j => { const v = j.functional_area_v2 || 'NULL'; faMap.set(v, (faMap.get(v) || 0) + 1); });
  Array.from(faMap.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   ${v.padEnd(22)} ${c} (${((c/allJobs.length)*100).toFixed(1)}%)`));

  // 4. Distribuzione seniority_v2
  console.log('\n4️⃣  DISTRIBUZIONE seniority_v2');
  const senMap = new Map();
  allJobs.forEach(j => { const v = j.seniority_v2 || 'NULL'; senMap.set(v, (senMap.get(v) || 0) + 1); });
  Array.from(senMap.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   ${v.padEnd(22)} ${c} (${((c/allJobs.length)*100).toFixed(1)}%)`));

  // 5. Distribuzione therapeutic_area
  console.log('\n5️⃣  DISTRIBUZIONE therapeutic_area (non-NULL)');
  const taMap = new Map();
  allJobs.forEach(j => { if (j.therapeutic_area) taMap.set(j.therapeutic_area, (taMap.get(j.therapeutic_area) || 0) + 1); });
  Array.from(taMap.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   ${v.padEnd(22)} ${c}`));

  // 6. Companies
  console.log('\n6️⃣  AZIENDE (companies)');
  const { count: totalCompanies } = await supabase.from('companies').select('*', { count: 'exact', head: true });
  const { count: withSector } = await supabase.from('companies').select('*', { count: 'exact', head: true }).not('sector_v2', 'is', null);
  const { data: companiesSectors } = await supabase.from('companies').select('sector_v2').not('sector_v2', 'is', null);
  const officialSectorValues = new Set(['Big Pharma','Mid Pharma','Specialty Pharma','Pharma','Biotech','Medical Devices','Diagnostics','CRO','CDMO','Chimico','Agrochimica','Consumer Health','Nutraceutical','Cosmetics','Veterinary','Digital Health','Healthcare Services','Farmacia/Retail','EHS/HSE Consulting','Consulenza','Altro']);
  const invalidSectors = companiesSectors.filter(c => !officialSectorValues.has(c.sector_v2));
  console.log(`   Totale: ${totalCompanies} | Con sector_v2: ${withSector} (${((withSector/totalCompanies)*100).toFixed(1)}%)`);
  console.log(`   Valori sector_v2 non ufficiali: ${invalidSectors.length}`);
  if (invalidSectors.length) console.log('      Valori:', [...new Set(invalidSectors.map(c=>c.sector_v2))]);

  // 7. Integrità referenziale
  console.log('\n7️⃣  INTEGRITÀ REFERENZIALE');
  const { count: noCompany } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).is('company_id', null);
  const { data: allCompanyIds } = await supabase.from('companies').select('id');
  const validCompanyIds = new Set(allCompanyIds.map(c => c.id));
  const { data: jobCompanyIds } = await supabase.from('job_listings').select('company_id').not('company_id', 'is', null);
  const orphanRefs = jobCompanyIds.filter(j => !validCompanyIds.has(j.company_id));
  console.log(`   Annunci senza company_id: ${noCompany}`);
  console.log(`   Annunci con company_id che punta a un'azienda inesistente: ${orphanRefs.length}`);

  // 8. Duplicati esatti (stesso titolo + stessa azienda + stesso company_id)
  console.log('\n8️⃣  CONTROLLO DUPLICATI (stesso titolo+azienda)');
  const { data: dupCheck } = await supabase.from('job_listings').select('job_title, company_id');
  const dupMap = new Map();
  dupCheck.forEach(j => {
    const key = `${j.job_title}|${j.company_id}`;
    dupMap.set(key, (dupMap.get(key) || 0) + 1);
  });
  const duplicates = Array.from(dupMap.entries()).filter(([k,c]) => c > 1);
  const totalDupRecords = duplicates.reduce((s,[k,c]) => s+c, 0);
  console.log(`   Gruppi con titolo+azienda duplicati: ${duplicates.length} (${totalDupRecords} record coinvolti)`);

  // 9. Tassonomia (job_taxonomy / job_aliases)
  console.log('\n9️⃣  CRESCITA TASSONOMIA (job_taxonomy / job_aliases)');
  const { count: taxCount } = await supabase.from('job_taxonomy').select('*', { count: 'exact', head: true });
  const { count: aliasCount } = await supabase.from('job_aliases').select('*', { count: 'exact', head: true });
  console.log(`   job_taxonomy: ${taxCount} ruoli`);
  console.log(`   job_aliases: ${aliasCount} alias`);

  // 10. Ambito Life Sciences (controllo residuo out-of-scope)
  console.log('\n🔟 CONTROLLO RESIDUO FUORI AMBITO (parole chiave sospette)...');
  const suspiciousPatterns = [/chef/i, /cuoco/i, /cameriere/i, /sommelier/i, /barista/i, /maitre/i];
  const { data: titlesCheck } = await supabase.from('job_listings').select('id, job_title, company_name');
  const suspicious = titlesCheck.filter(j => suspiciousPatterns.some(p => p.test(j.job_title)));
  console.log(`   Trovati: ${suspicious.length}`);
  suspicious.forEach(j => console.log(`      "${j.job_title}" — ${j.company_name}`));

  console.log('\n' + '═'.repeat(90));
  console.log('\n📌 RIEPILOGO FINALE');
  console.log(`   functional_area_v2: ${((allJobs.filter(j=>j.functional_area_v2).length/allJobs.length)*100).toFixed(1)}% — ${invalidFA.length===0?'✅ tutti validi':'❌ '+invalidFA.length+' non validi'}`);
  console.log(`   seniority_v2: ${((allJobs.filter(j=>j.seniority_v2).length/allJobs.length)*100).toFixed(1)}% — ${invalidSen.length===0?'✅ tutti validi':'❌ '+invalidSen.length+' non validi'}`);
  console.log(`   therapeutic_area: ${((allJobs.filter(j=>j.therapeutic_area).length/allJobs.length)*100).toFixed(1)}% (onesto, tetto raggiunto) — ${invalidTA.length===0?'✅ tutti validi':'❌ '+invalidTA.length+' non validi'}`);
  console.log(`   companies.sector_v2: ${((withSector/totalCompanies)*100).toFixed(1)}% — ${invalidSectors.length===0?'✅ tutti validi':'❌ '+invalidSectors.length+' non validi'}`);
  console.log(`   Integrità referenziale: ${noCompany===0 && orphanRefs.length===0?'✅ OK':'❌ problemi trovati'}`);
  console.log(`   Contenuti fuori ambito residui: ${suspicious.length===0?'✅ nessuno':'⚠️ '+suspicious.length+' da rivedere'}`);
  console.log('');
}
diagnosi();
