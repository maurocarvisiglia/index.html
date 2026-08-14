import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase
    .from('unmapped_job_titles')
    .select('job_title, sample_company, occurrences')
    .order('occurrences', { ascending: false });

  console.log(`Totale titoli non mappati: ${data.length}\n`);
  data.forEach((t, i) => {
    console.log(`${String(i+1).padStart(3)}. [${t.occurrences}x] "${t.job_title}" — ${t.sample_company || 'N/D'}`);
  });
}
run();
