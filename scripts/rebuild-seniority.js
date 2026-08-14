import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Replica esatta di classifySeniorityFromText() in index.html
function classifySeniorityFromText(t) {
  if (!t) return null;
  if (/\bstage\b|tirocin|\bintern(ship)?\b/i.test(t)) return 'internship';
  if (/\b(ceo|cfo|cto|coo|cmo|cso)\b|chief\s+\w+\s+officer/i.test(t)) return 'c_level';
  if (/\bvp\b|vice president/i.test(t)) return 'vp';
  if (/general manager|direttore generale/i.test(t)) return 'general_manager';
  if (/country manager|country head|direttore paese/i.test(t)) return 'country_manager';
  if (/senior director|direttore senior/i.test(t)) return 'senior_director';
  if (/\bdirector\b|\bdirettore\b|\bdirettrice\b/i.test(t)) return 'director';
  if (/head of|responsabile nazionale/i.test(t)) return 'head_of';
  if (/\bjunior\b|neo[\s-]?laureat/i.test(t)) return 'entry_level';
  if (/senior manager/i.test(t)) return 'senior_manager';
  if (/\bmanager\b|\bresponsabile\b|\bcapo\b/i.test(t)) return 'manager';
  if (/\blead\b|coordinat/i.test(t)) return 'lead';
  if (/\bprincipal\b|distinguished/i.test(t)) return 'principal';
  if (/\bexpert\b/i.test(t)) return 'expert';
  if (/\bsenior\b/i.test(t)) return 'senior_specialist';
  if (/\bassociate\b|\bassistant\b|\bassistente\b/i.test(t)) return 'associate';
  if (/\bspecialist\b|\bspecialista\b/i.test(t)) return 'specialist';
  if (/\b0-1\s*ann|entry[\s-]?level/i.test(t)) return 'entry_level';
  if (/\b1-3\s*anni/i.test(t)) return 'associate';
  if (/\b3-6\s*anni/i.test(t)) return 'specialist';
  if (/\b6-10\s*anni/i.test(t)) return 'senior_specialist';
  if (/\b10\+?\s*anni/i.test(t)) return 'expert';
  return null;
}

async function run() {
  console.log('🔧 RICOSTRUZIONE seniority_v2 (funzione deterministica reale)\n');
  console.log('═'.repeat(80));

  console.log('\n1️⃣  AZZERAMENTO valori attuali (corrotti dal bug precedente)...');
  const { data: allJobs } = await supabase.from('job_listings').select('id, job_title, job_description, seniority_v2');
  let reset = 0;
  for (const j of allJobs) {
    if (j.seniority_v2 !== null) {
      await supabase.from('job_listings').update({ seniority_v2: null }).eq('id', j.id);
      reset++;
    }
  }
  console.log(`   ✅ Azzerati: ${reset}`);

  console.log('\n2️⃣  CLASSIFICAZIONE (titolo, poi descrizione come fallback)...');
  let classified = 0, left = 0;
  const dist = new Map();
  for (const j of allJobs) {
    const code = classifySeniorityFromText(j.job_title) || classifySeniorityFromText(j.job_description);
    if (code) {
      await supabase.from('job_listings').update({ seniority_v2: code }).eq('id', j.id);
      classified++;
      dist.set(code, (dist.get(code) || 0) + 1);
    } else {
      left++;
    }
  }
  console.log(`   ✅ Classificati: ${classified} | Restano NULL: ${left}`);

  console.log('\n3️⃣  DISTRIBUZIONE...');
  Array.from(dist.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => {
    console.log(`   ${v.padEnd(20)} ${c} (${((c/classified)*100).toFixed(1)}%)`);
  });

  console.log('\n' + '═'.repeat(80));
  console.log(`\n📊 Copertura: ${classified}/${allJobs.length} (${((classified/allJobs.length)*100).toFixed(1)}%)\n`);
}

run();
