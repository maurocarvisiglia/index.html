import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Normalizza un nome azienda per il confronto: minuscolo, rimuove forme societarie
// comuni (S.p.A., S.r.l., SRL, SPA, LTD, INC, ecc.), punteggiatura, spazi multipli.
function normalize(name) {
  if (!name) return '';
  let n = name.toLowerCase();
  n = n.replace(/\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|s\.?t\.?p\.?|ltd|inc|italia|italy|s\.?u\.?|società|per azioni|a responsabilità limitata|unipersonale|in breve.*|o .*società.*)\b/gi, '');
  n = n.replace(/[.,'’\-–—()]/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

async function run() {
  console.log('📋 DIAGNOSI DUPLICATI — tabella companies\n');
  console.log('═'.repeat(90));

  const { data: companies } = await supabase.from('companies').select('id, name, ragione_sociale, sector_v2, website, entity_type');
  console.log(`\nTotale aziende: ${companies.length}`);

  // 1. Duplicati ESATTI per "name" (case-insensitive) — non dovrebbero esistere ma verifichiamo
  console.log('\n1️⃣  DUPLICATI ESATTI (stesso "name", case-insensitive)...');
  const byExactName = new Map();
  companies.forEach(c => {
    const key = (c.name || '').trim().toLowerCase();
    if (!key) return;
    if (!byExactName.has(key)) byExactName.set(key, []);
    byExactName.get(key).push(c);
  });
  const exactDupes = [...byExactName.entries()].filter(([,arr]) => arr.length > 1);
  console.log(`   Gruppi trovati: ${exactDupes.length} (${exactDupes.reduce((s,[,a])=>s+a.length,0)} record coinvolti)`);
  exactDupes.slice(0, 15).forEach(([name, arr]) => console.log(`   [${arr.length}x] "${name}"`));

  // 2. Duplicati per NOME NORMALIZZATO (stessa azienda, forma societaria/punteggiatura diversa)
  console.log('\n2️⃣  DUPLICATI PER NOME NORMALIZZATO (stessa azienda, forma legale/punteggiatura diversa)...');
  const byNorm = new Map();
  companies.forEach(c => {
    const key = normalize(c.name);
    if (!key || key.length < 3) return;
    if (!byNorm.has(key)) byNorm.set(key, []);
    byNorm.get(key).push(c);
  });
  const normDupes = [...byNorm.entries()].filter(([,arr]) => arr.length > 1);
  console.log(`   Gruppi trovati: ${normDupes.length} (${normDupes.reduce((s,[,a])=>s+a.length,0)} record coinvolti)`);
  normDupes
    .sort((a,b) => b[1].length - a[1].length)
    .slice(0, 40)
    .forEach(([key, arr]) => {
      console.log(`\n   [${arr.length}x] chiave normalizzata: "${key}"`);
      arr.forEach(c => console.log(`      - "${c.name}" (ragione_sociale: ${c.ragione_sociale || '—'}, sector_v2: ${c.sector_v2 || '—'}, id: ${c.id})`));
    });

  if (normDupes.length > 40) console.log(`\n   ... e altri ${normDupes.length - 40} gruppi non mostrati`);

  // 3. Quanti annunci sono collegati a ciascun id nei gruppi duplicati (per capire l'impatto)
  console.log('\n3️⃣  IMPATTO SU job_listings (annunci frammentati tra i duplicati)...');
  const { data: jobCounts } = await supabase.from('job_listings').select('company_id');
  const jobCountByCompany = new Map();
  jobCounts.forEach(j => { if (j.company_id) jobCountByCompany.set(j.company_id, (jobCountByCompany.get(j.company_id)||0)+1); });

  let totalFragmentedJobs = 0, groupsWithJobs = 0;
  normDupes.forEach(([key, arr]) => {
    const totalJobs = arr.reduce((s,c) => s + (jobCountByCompany.get(c.id)||0), 0);
    if (totalJobs > 0) { groupsWithJobs++; totalFragmentedJobs += totalJobs; }
  });
  console.log(`   Gruppi duplicati con almeno un annuncio collegato: ${groupsWithJobs}`);
  console.log(`   Annunci totali "frammentati" tra id diversi della stessa azienda: ${totalFragmentedJobs}`);

  console.log('\n' + '═'.repeat(90));
}
run();
