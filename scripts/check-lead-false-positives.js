import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name, job_description')
    .eq('seniority_v2', 'lead');

  console.log(`Totale record con seniority_v2='lead': ${data.length}\n`);

  let titleMatch = 0, descOnlyMatch = 0, verbFalsePositive = 0;
  const falsePositives = [];

  for (const j of data) {
    const titleHasLead = /\blead\b|coordinat/i.test(j.job_title || '');
    if (titleHasLead) { titleMatch++; continue; }

    descOnlyMatch++;
    const desc = j.job_description || '';
    // Cerca "lead" preceduto da "to " (uso verbale tipico: "prepared to lead", "ability to lead")
    const verbUsage = /\bto\s+lead\b/i.test(desc);
    const nounUsage = /\b(team|tech|technical|project|group|regional|country|clinical|product|engineering|global)\s+lead\b/i.test(desc);
    if (verbUsage && !nounUsage) {
      verbFalsePositive++;
      falsePositives.push(j);
    }
  }

  console.log(`Match dal titolo (affidabile): ${titleMatch}`);
  console.log(`Match solo dalla descrizione: ${descOnlyMatch}`);
  console.log(`  di cui probabile falso positivo ("to lead" verbale, nessun "X Lead" nominale): ${verbFalsePositive}`);

  console.log('\n📋 Falsi positivi trovati:');
  falsePositives.forEach(j => {
    const snippet = (j.job_description||'').match(/.{30}\bto\s+lead\b.{30}/i);
    console.log(`   "${j.job_title}" — ${j.company_name}`);
    console.log(`      ...${snippet ? snippet[0] : ''}...`);
  });
}
run();
