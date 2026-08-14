import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('📋 ANALISI 760 ANNUNCI CON contract_type NULL\n');
  console.log('═'.repeat(90));

  const { data: nullJobs } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name, ragione_sociale, source, functional_area_v2, published_date, company_id')
    .is('contract_type', null);

  console.log(`\nTotale: ${nullJobs.length}`);

  // 1. Per source
  console.log('\n1️⃣  PER SOURCE...');
  const bySource = new Map();
  nullJobs.forEach(j => { const v = j.source || 'NULL'; bySource.set(v, (bySource.get(v)||0)+1); });
  Array.from(bySource.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   ${v}: ${c} (${((c/nullJobs.length)*100).toFixed(1)}%)`));

  // 2. Per azienda (top 20)
  console.log('\n2️⃣  TOP 20 AZIENDE con più NULL...');
  const byCompany = new Map();
  nullJobs.forEach(j => { const v = j.ragione_sociale || j.company_name || 'N/D'; byCompany.set(v, (byCompany.get(v)||0)+1); });
  Array.from(byCompany.entries()).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([v,c]) => console.log(`   ${v}: ${c}`));
  console.log(`   Aziende distinte coinvolte: ${byCompany.size}`);

  // 3. Per functional_area_v2
  console.log('\n3️⃣  PER functional_area_v2...');
  const byFA = new Map();
  nullJobs.forEach(j => { const v = j.functional_area_v2 || 'NULL'; byFA.set(v, (byFA.get(v)||0)+1); });
  Array.from(byFA.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   ${v}: ${c} (${((c/nullJobs.length)*100).toFixed(1)}%)`));

  // 4. Confronto: la % di NULL è omogenea o concentrata rispetto al totale per ogni source?
  console.log('\n4️⃣  TASSO DI NULL PER SOURCE (rispetto al totale di quella source, non solo tra i NULL)...');
  const { data: allJobs } = await supabase.from('job_listings').select('source, contract_type');
  const totalBySource = new Map(), nullBySource = new Map();
  allJobs.forEach(j => {
    const v = j.source || 'NULL';
    totalBySource.set(v, (totalBySource.get(v)||0)+1);
    if (!j.contract_type) nullBySource.set(v, (nullBySource.get(v)||0)+1);
  });
  Array.from(totalBySource.entries()).sort((a,b)=>b[1]-a[1]).forEach(([source,total]) => {
    const nulls = nullBySource.get(source)||0;
    console.log(`   ${source}: ${nulls}/${total} NULL (${((nulls/total)*100).toFixed(1)}%)`);
  });

  // 5. Per periodo (published_date, raggruppato per mese)
  console.log('\n5️⃣  PER MESE DI PUBBLICAZIONE...');
  const byMonth = new Map();
  nullJobs.forEach(j => {
    const m = (j.published_date || 'N/D').substring(0,7);
    byMonth.set(m, (byMonth.get(m)||0)+1);
  });
  Array.from(byMonth.entries()).sort().forEach(([v,c]) => console.log(`   ${v}: ${c}`));

  console.log('\n' + '═'.repeat(90));
}
run();
