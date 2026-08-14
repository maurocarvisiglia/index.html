import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { count: total } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
  const { count: withDesc } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('job_description', 'is', null);
  const { count: withTA } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('therapeutic_area', 'is', null);
  console.log(`Totale: ${total}`);
  console.log(`Con job_description: ${withDesc} (${((withDesc/total)*100).toFixed(1)}%)`);
  console.log(`Con therapeutic_area già assegnata: ${withTA}`);

  const { data: sample } = await supabase.from('job_listings').select('job_title, job_description').not('job_description', 'is', null).is('therapeutic_area', null).limit(5);
  sample?.forEach(s => console.log(`\n"${s.job_title}"\n${(s.job_description||'').substring(0,300)}`));
}
run();
