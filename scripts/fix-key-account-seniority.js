import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Stessa logica appena aggiunta a classifySeniorityFromText() in index.html: i Key
// Account sono ruoli individuali, non management, a meno che il titolo indichi
// esplicitamente la guida di altri key account ("lead").
function classify(title) {
  const t = title || '';
  if (/\blead\b/i.test(t) && !/\bto\s+lead\b/i.test(t)) return 'lead';
  if (/\bsenior\b/i.test(t)) return 'senior_specialist';
  return 'specialist';
}

async function run() {
  console.log('🔧 FIX seniority "Key Account" erroneamente classificati come "manager"\n');
  console.log('═'.repeat(80));

  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, seniority_v2')
    .ilike('job_title', '%key account%')
    .eq('seniority_v2', 'manager');

  console.log(`Trovati: ${jobs.length}\n`);

  let specialist = 0, seniorSpecialist = 0, lead = 0;
  for (const j of jobs) {
    const value = classify(j.job_title);
    await supabase.from('job_listings').update({ seniority_v2: value }).eq('id', j.id);
    if (value === 'specialist') specialist++;
    else if (value === 'senior_specialist') seniorSpecialist++;
    else lead++;
    console.log(`   "${j.job_title}" → ${value}`);
  }

  console.log(`\n📊 RISULTATO: ${specialist} specialist | ${seniorSpecialist} senior_specialist | ${lead} lead`);
  console.log('\n' + '═'.repeat(80));
}
run();
