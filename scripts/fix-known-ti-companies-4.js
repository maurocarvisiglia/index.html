import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const COMPANY_PATTERNS = ['%fresenius%', '%haleon%', '%stryker%', '%steris%', '%patheon%'];

async function run() {
  console.log('🔧 Fresenius / Haleon / Stryker / Steris / Patheon — NULL → TI (confermato dall\'utente)\n');

  let totalUpdated = 0;
  for (const pattern of COMPANY_PATTERNS) {
    const { data: jobs } = await supabase
      .from('job_listings')
      .select('id, job_title, company_name, ragione_sociale')
      .is('contract_type', null)
      .or(`company_name.ilike.${pattern},ragione_sociale.ilike.${pattern}`);

    if (!jobs.length) { console.log(`"${pattern}": nessun NULL trovato`); continue; }

    for (const j of jobs) {
      await supabase.from('job_listings').update({ contract_type: 'TI' }).eq('id', j.id);
    }
    console.log(`"${pattern}": ${jobs.length} aggiornati a TI`);
    totalUpdated += jobs.length;
  }

  console.log(`\n✅ Totale aggiornati: ${totalUpdated}`);

  const { count: total } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
  const { count: nullCount } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).is('contract_type', null);
  console.log(`\n📊 NULL rimanenti: ${nullCount}/${total} (${((nullCount/total)*100).toFixed(1)}%)`);
}
run();
