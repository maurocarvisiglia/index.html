import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { count: total } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
  const { count: withUrl } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('url', 'is', null);
  const { count: withSourceUrl } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('source_url', 'is', null);
  console.log(`Totale: ${total}`);
  console.log(`Con url: ${withUrl}`);
  console.log(`Con source_url: ${withSourceUrl}`);

  const { data: sample } = await supabase.from('job_listings').select('job_title, company_name, url, source_url').not('url', 'is', null).limit(5);
  sample?.forEach(j => console.log(`\n"${j.job_title}" — ${j.company_name}\nurl: ${j.url}\nsource_url: ${j.source_url}`));
}
run();
