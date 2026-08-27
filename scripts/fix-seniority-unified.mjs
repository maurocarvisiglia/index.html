// Riclassifica retroattivamente seniority_v2 su TUTTI gli annunci con l'unica
// funzione condivisa (scripts/lib/seniority-classifier.mjs, estratta parola per
// parola da index.html — non una riscrittura a mano, per garanzia di parita').
//
// Fino ad oggi esistevano due classificatori indipendenti (uno nell'import CSV,
// uno nella riclassificazione) che divergevano su 233/2513 annunci (9%), e la
// regola "i Key Account non sono mai manager" esisteva solo in uno dei due:
// ogni nuovo import la reintroduceva. Diagnosticato e unificato il 27/08/2026.
//
// node scripts/fix-seniority-unified.mjs --dry-run   (solo report, nessuna scrittura)
// node scripts/fix-seniority-unified.mjs             (applica)
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { classifySeniorityDeterministic } from './lib/seniority-classifier.mjs';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(DRY_RUN ? '🔎 DRY RUN — nessuna scrittura\n' : '⚠️  MODALITA\' REALE\n');

  const { data: listings } = await supabase
    .from('job_listings')
    .select('id, job_title, job_description, seniority_v2, canonical_role, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  console.log('Annunci analizzati (ultimi 200 per data di inserimento):', listings.length);

  let changed = 0, unchanged = 0, noSignal = 0;
  const changesByPair = {};
  const changesList = [];

  for (const l of listings) {
    const newVal = classifySeniorityDeterministic(l.job_title, l.job_description, l.canonical_role);
    if (!newVal) { noSignal++; continue; }
    if (newVal === l.seniority_v2) { unchanged++; continue; }
    changed++;
    const key = `${l.seniority_v2 || '(vuoto)'} -> ${newVal}`;
    changesByPair[key] = (changesByPair[key] || 0) + 1;
    changesList.push({ id: l.id, title: l.job_title, from: l.seniority_v2, to: newVal });
    if (!DRY_RUN) {
      await supabase.from('job_listings').update({ seniority_v2: newVal }).eq('id', l.id);
    }
  }

  console.log('\n=== RIEPILOGO ===');
  console.log('Invariati:', unchanged);
  console.log('Nessun segnale (titolo+descrizione muti):', noSignal);
  console.log('Cambiati:', changed);
  console.log('\n=== CAMBIAMENTI PER TIPO ===');
  Object.entries(changesByPair).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(String(v).padStart(4), k));

  console.log('\n=== ESEMPI (max 3 per tipo) ===');
  const shown = {};
  for (const c of changesList) {
    const key = `${c.from || '(vuoto)'} -> ${c.to}`;
    shown[key] = (shown[key] || 0) + 1;
    if (shown[key] <= 3) console.log(`  [${key}] ${c.title}`);
  }
}
main();
