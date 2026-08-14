import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Stesse regole di prima, applicate a titolo + descrizione combinati.
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

function classify(text) {
  if (!text) return null;
  const matched = new Set();
  for (const rule of rules) {
    if (rule.patterns.some(p => p.test(text))) matched.add(rule.code);
  }
  if (matched.size === 0) return null;
  if (matched.size > 1) return 'multiple';
  return [...matched][0];
}

async function run() {
  console.log('🔧 RICOSTRUZIONE therapeutic_area (titolo + descrizione)\n');
  console.log('═'.repeat(80));

  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, job_description, therapeutic_area');

  console.log(`Totale: ${jobs.length}`);
  const alreadySet = jobs.filter(j => j.therapeutic_area).length;
  console.log(`Già classificati (dal solo titolo, invariati): ${alreadySet}`);

  let classified = 0, left = 0;
  const dist = new Map();
  for (const j of jobs) {
    if (j.therapeutic_area) continue; // non tocco quelli già assegnati dal passaggio precedente

    const combined = (j.job_title || '') + ' ' + (j.job_description || '');
    const code = classify(combined);
    if (code) {
      await supabase.from('job_listings').update({ therapeutic_area: code }).eq('id', j.id);
      classified++;
      dist.set(code, (dist.get(code) || 0) + 1);
    } else {
      left++;
    }
  }
  console.log(`\n✅ Nuovi classificati (da descrizione): ${classified}`);
  console.log(`⚪ Restano NULL: ${left}`);

  console.log('\nDistribuzione nuovi...');
  Array.from(dist.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   ${v.padEnd(22)} ${c}`));

  console.log('\n📊 COPERTURA TOTALE FINALE...');
  const { count: totalJobs } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
  const { count: withTA } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('therapeutic_area', 'is', null);
  console.log(`   Con therapeutic_area: ${withTA}/${totalJobs} (${((withTA/totalJobs)*100).toFixed(1)}%)`);
  console.log('\n' + '═'.repeat(80));
}
run();
