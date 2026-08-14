import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const COMPANY_PATTERNS = ['%farmacia%', '%farmacie%', '%parafarmacia%'];

async function run() {
  console.log('🔧 Farmacie/Parafarmacie retail — NULL → TI (confermato dall\'utente)\n');

  const seen = new Set();
  let totalUpdated = 0;

  for (const pattern of COMPANY_PATTERNS) {
    const { data: jobs } = await supabase
      .from('job_listings')
      .select('id, job_title, company_name, ragione_sociale')
      .is('contract_type', null)
      .or(`company_name.ilike.${pattern},ragione_sociale.ilike.${pattern}`);

    const toUpdate = jobs.filter(j => !seen.has(j.id));
    toUpdate.forEach(j => seen.add(j.id));

    if (!toUpdate.length) { console.log(`"${pattern}": nessun NULL nuovo trovato`); continue; }

    for (const j of toUpdate) {
      await supabase.from('job_listings').update({ contract_type: 'TI' }).eq('id', j.id);
    }
    console.log(`"${pattern}": ${toUpdate.length} aggiornati a TI`);
    totalUpdated += toUpdate.length;
  }

  console.log(`\n✅ Totale aggiornati: ${totalUpdated}`);

  const { count: total } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
  const { count: nullCount } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).is('contract_type', null);
  console.log(`\n📊 NULL rimanenti: ${nullCount}/${total} (${((nullCount/total)*100).toFixed(1)}%)`);

  // Mostra chi resta
  const { data: remaining } = await supabase.from('job_listings').select('company_name, ragione_sociale').is('contract_type', null);
  const byCompany = new Map();
  remaining.forEach(j => { const v = j.ragione_sociale || j.company_name || 'N/D'; byCompany.set(v, (byCompany.get(v)||0)+1); });
  console.log('\n📋 Top 20 aziende ancora con NULL:');
  Array.from(byCompany.entries()).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([v,c]) => console.log(`   ${v}: ${c}`));
  console.log(`\nAziende distinte ancora coinvolte: ${byCompany.size}`);
}
run();
