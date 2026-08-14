import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase
    .from('job_listings')
    .select('job_title, job_description')
    .eq('job_title', 'Medical Science Liaison, North Italy')
    .eq('company_name', 'Argenx');

  const job = data[0];
  console.log('TITOLO:', job.job_title);
  console.log('\nDESCRIZIONE COMPLETA:\n', job.job_description);

  console.log('\n\n🔎 Occorrenze di "lead" o "coordinat" nel testo:');
  const text = job.job_description || '';
  const regex = /\blead\b|coordinat/gi;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const start = Math.max(0, m.index - 40);
    const end = Math.min(text.length, m.index + 40);
    console.log(`   ...${text.substring(start, end)}...`);
  }

  // Test anche sul titolo
  console.log('\n🔎 Il titolo contiene "lead" o "coordinat"?', /\blead\b|coordinat/i.test(job.job_title));
}
run();
