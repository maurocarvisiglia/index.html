import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Match esplicito per parola chiave sui 20 codici ufficiali (tabella therapeutic_areas).
// Ordine = priorità. Nessuna inferenza indiretta: solo menzione esplicita nel titolo.
const rules = [
  { code: 'rare_diseases', patterns: [/rare disease/i, /malattie rare/i, /\borphan\b/i] },
  { code: 'oncology', patterns: [/oncolog/i, /\bcancer\b/i, /\btumor/i, /\btumori\b/i, /leukemia/i, /lymphoma/i, /myeloma/i, /oncoheme/i, /oncohematology/i] },
  { code: 'hematology', patterns: [/hematolog/i, /ematolog/i, /\bhemophilia\b/i, /thalassemia/i, /sickle cell/i, /thrombosis/i] },
  { code: 'immunology', patterns: [/immunolog/i] },
  { code: 'cardiovascular', patterns: [/cardiovascular/i, /cardiolog/i, /\bcardiac\b/i, /heart failure/i, /hypertension/i, /dyslipidemia/i] },
  { code: 'diabetes', patterns: [/diabet/i, /\bobesity\b/i, /obesità/i] },
  { code: 'respiratory', patterns: [/respiratory/i, /pneumolog/i, /\basthma\b/i, /\basma\b/i, /\bcopd\b/i, /\bbpco\b/i, /pulmonary/i] },
  { code: 'neuroscience', patterns: [/neuroscience/i] },
  { code: 'neurology', patterns: [/neurolog/i, /parkinson/i, /alzheimer/i, /epilepsy/i, /multiple sclerosis/i, /sclerosi multipla/i, /psychiatry/i] },
  { code: 'dermatology', patterns: [/dermatolog/i, /psoriasis/i, /atopic dermatitis/i] },
  { code: 'ophthalmology', patterns: [/ophthalmolog/i, /oftalmolog/i, /ophthalmic/i, /\biol\b/i, /oculist/i] },
  { code: 'vaccines', patterns: [/\bvaccin/i] },
  { code: 'infectious_diseases', patterns: [/infectious disease/i, /malattie infettive/i, /\bhiv\b/i] },
  { code: 'gastroenterology', patterns: [/gastroenterolog/i, /\bibd\b/i, /hepatolog/i, /epatolog/i] },
  { code: 'womens_health', patterns: [/women'?s health/i, /salute femminile/i, /gynecolog/i, /ginecolog/i, /fertility/i] },
  { code: 'urology', patterns: [/urolog/i] },
  { code: 'pain', patterns: [/\bpain\b/i, /\bdolore\b/i] },
  { code: 'ta_consumer_health', patterns: [/consumer health/i] }
];

function classify(title) {
  if (!title) return null;
  const matched = new Set();
  for (const rule of rules) {
    if (rule.patterns.some(p => p.test(title))) matched.add(rule.code);
  }
  if (matched.size === 0) return null;
  if (matched.size > 1) return 'multiple';
  return [...matched][0];
}

async function run() {
  console.log('🔧 RICOSTRUZIONE therapeutic_area (match esplicito, nessuna inferenza)\n');
  console.log('═'.repeat(80));

  console.log('\n1️⃣  AZZERAMENTO valori attuali (non affidabili)...');
  const { data: allJobs } = await supabase.from('job_listings').select('id, job_title, therapeutic_area');
  let reset = 0;
  for (const j of allJobs) {
    if (j.therapeutic_area !== null) {
      await supabase.from('job_listings').update({ therapeutic_area: null }).eq('id', j.id);
      reset++;
    }
  }
  console.log(`   ✅ Azzerati: ${reset}`);

  console.log('\n2️⃣  CLASSIFICAZIONE DA MENZIONE ESPLICITA NEL TITOLO...');
  let classified = 0, left = 0;
  const dist = new Map();
  for (const j of allJobs) {
    const code = classify(j.job_title);
    if (code) {
      await supabase.from('job_listings').update({ therapeutic_area: code }).eq('id', j.id);
      classified++;
      dist.set(code, (dist.get(code) || 0) + 1);
    } else {
      left++;
    }
  }
  console.log(`   ✅ Classificati: ${classified} | Restano NULL: ${left}`);

  console.log('\n3️⃣  DISTRIBUZIONE...');
  Array.from(dist.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   ${v.padEnd(22)} ${c}`));

  console.log('\n' + '═'.repeat(80));
  console.log(`\n📊 Copertura: ${classified}/${allJobs.length} (${((classified/allJobs.length)*100).toFixed(1)}%)\n`);
}

run();
