import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Funzione corretta, identica a quella ora in index.html
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
  if (/coordinat/i.test(t) || (/\blead\b/i.test(t) && !/\bto\s+lead\b/i.test(t))) return 'lead';
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
  console.log('🔎 RISCANSIONE GLOBALE seniority_v2 (verifica falsi positivi "lead")\n');

  const { data: currentLeads } = await supabase.from('job_listings').select('id, job_title, job_description, company_name').eq('seniority_v2', 'lead');
  console.log(`Record attualmente "lead": ${currentLeads.length}`);

  let changed = 0;
  const changedList = [];
  for (const j of currentLeads) {
    const newVal = classifySeniorityFromText(j.job_title) || classifySeniorityFromText(j.job_description);
    if (newVal !== 'lead') {
      changedList.push({ ...j, newVal });
    }
  }

  console.log(`\nRecord che con la funzione corretta NON risultano più "lead": ${changedList.length}`);
  changedList.forEach(j => console.log(`   "${j.job_title}" — ${j.company_name} → nuovo valore: ${j.newVal}`));

  if (!changedList.length) {
    console.log('\n✅ Nessun altro falso positivo nel dataset attuale (oltre a quello già trovato su Argenx).');
    return;
  }
}
run();
