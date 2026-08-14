import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('📋 DIAGNOSI SISTEMICA: coerenza classificazione per titolo identico\n');
  console.log('═'.repeat(90));

  const { data: jobs } = await supabase
    .from('job_listings')
    .select('job_title, canonical_role, role_family, functional_area_v2, classification_source, sub_area');

  console.log(`\nTotale annunci: ${jobs.length}`);

  // Raggruppa per titolo esatto (case-sensitive, come fa il sistema reale nel match esatto alias)
  const byTitle = new Map();
  jobs.forEach(j => {
    const key = (j.job_title || '').trim();
    if (!key) return;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(j);
  });

  console.log(`Titoli distinti: ${byTitle.size}`);

  // Trova titoli con >1 occorrenza E canonical_role incoerente
  const inconsistentCanonical = [];
  const inconsistentFA = [];
  let totalRecordsInInconsistentGroups = 0;

  byTitle.forEach((records, title) => {
    if (records.length < 2) return;
    const canonicalValues = new Set(records.map(r => r.canonical_role || 'NULL'));
    const faValues = new Set(records.map(r => r.functional_area_v2 || 'NULL'));

    if (canonicalValues.size > 1) {
      inconsistentCanonical.push({ title, count: records.length, values: [...canonicalValues], sources: [...new Set(records.map(r=>r.classification_source||'NULL'))] });
      totalRecordsInInconsistentGroups += records.length;
    }
    if (faValues.size > 1) {
      inconsistentFA.push({ title, count: records.length, values: [...faValues] });
    }
  });

  console.log(`\n1️⃣  TITOLI CON canonical_role INCOERENTE (stesso titolo, ruolo diverso): ${inconsistentCanonical.length}`);
  console.log(`   Record totali coinvolti: ${totalRecordsInInconsistentGroups}`);
  console.log(`   (${((totalRecordsInInconsistentGroups/jobs.length)*100).toFixed(1)}% di tutto il dataset)\n`);

  inconsistentCanonical
    .sort((a,b) => b.count - a.count)
    .slice(0, 25)
    .forEach(g => {
      console.log(`   [${g.count}x] "${g.title}"`);
      console.log(`        → ${g.values.join(' | ')}`);
      console.log(`        (fonti: ${g.sources.join(', ')})`);
    });

  if (inconsistentCanonical.length > 25) {
    console.log(`\n   ... e altri ${inconsistentCanonical.length - 25} titoli con lo stesso problema`);
  }

  console.log(`\n2️⃣  TITOLI CON functional_area_v2 INCOERENTE: ${inconsistentFA.length}`);
  const totalFARecords = inconsistentFA.reduce((s,g)=>s+g.count, 0);
  console.log(`   Record coinvolti: ${totalFARecords} (${((totalFARecords/jobs.length)*100).toFixed(1)}%)`);

  // Root cause: quanti hanno classification_source diverso all'interno dello stesso gruppo inconsistente?
  console.log(`\n3️⃣  CAUSA PROBABILE — quanti gruppi incoerenti hanno fonti di classificazione MISTE?`);
  const mixedSourceGroups = inconsistentCanonical.filter(g => g.sources.length > 1);
  console.log(`   Gruppi con fonti miste (es. alias esatto + AI): ${mixedSourceGroups.length}/${inconsistentCanonical.length}`);

  console.log('\n' + '═'.repeat(90));
  console.log('\n📌 IMPLICAZIONE PER I REPORT:');
  console.log(`   Qualsiasi report che raggruppa per canonical_role (Role Intelligence, Report generico,`);
  console.log(`   Talent Scarcity per ruolo) rischia di SOTTOCONTARE un ruolo ogni volta che quel ruolo`);
  console.log(`   ha titoli duplicati classificati in modo incoerente — non solo MSL/Merck.`);
  console.log('');
}
run();
