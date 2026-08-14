import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CONTRACT_MAP = { permanent: 'TI', contract: 'TI', temporary: 'TD', internship: 'altro', apprenticeship: 'TI', freelance: 'Agenzia' };

const CSV_FILES = [
  'Export Vocations - Mc Pharma Consulting.csv',
  'vocations-positions-1782405168.csv',
  'vocations-positions-1782747078.csv',
  'vocations-positions-1783326380.csv',
  'vocations-positions-1783503940.csv',
  'vocations-positions-1783504052.csv',
  'vocations-positions-1783581850.csv',
  'vocations-positions-1785142188.csv',
  'vocations-positions-1786438474.csv'
];

function readCsv(filename) {
  const path = `C:\\Users\\Utente\\Downloads\\${filename}`;
  if (!fs.existsSync(path)) { console.log(`⚠️  Non trovato: ${filename}`); return []; }
  let content = fs.readFileSync(path, 'utf-8');
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  try {
    return parse(content, { delimiter: ';', columns: true, skip_empty_lines: true, relax_column_count: true });
  } catch (e) {
    console.log(`⚠️  Errore parsing ${filename}: ${e.message}`);
    return [];
  }
}

async function run() {
  console.log('🔎 RICOSTRUZIONE contract_type DAI CSV STORICI\n');
  console.log('═'.repeat(90));

  // 1. Costruisci mappa (job_title|company_name normalizzato) -> Set di raw contract values osservati
  const lookup = new Map();
  let totalRows = 0;

  for (const file of CSV_FILES) {
    const rows = readCsv(file);
    console.log(`${file}: ${rows.length} righe`);
    totalRows += rows.length;
    rows.forEach(r => {
      const title = (r['Nome posizione'] || '').trim();
      const company = (r['Nome azienda'] || '').trim();
      const rawContract = (r['Contratto'] || '').trim().toLowerCase();
      if (!title || !company || !rawContract) return;
      const key = title.toLowerCase() + '|||' + company.toLowerCase();
      if (!lookup.has(key)) lookup.set(key, new Set());
      lookup.get(key).add(rawContract);
    });
  }

  console.log(`\nTotale righe CSV lette: ${totalRows}`);
  console.log(`Coppie titolo+azienda distinte trovate: ${lookup.size}`);

  const conflicts = [...lookup.entries()].filter(([,set]) => set.size > 1);
  console.log(`Coppie con valori Contratto in conflitto tra CSV diversi: ${conflicts.length}`);
  conflicts.slice(0, 10).forEach(([key, set]) => console.log(`   "${key}" -> ${[...set].join(', ')}`));

  // 2. Carica tutti i job_listings esistenti
  console.log('\n🔎 CARICAMENTO job_listings...');
  const { data: jobs } = await supabase.from('job_listings').select('id, job_title, company_name, contract_type');
  console.log(`Trovati: ${jobs.length}`);

  // 3. Per ciascun job_listing, cerca corrispondenza e determina il contract_type corretto
  let updated = 0, unchanged = 0, noMatch = 0, ambiguous = 0;
  const noMatchSamples = [];

  for (const j of jobs) {
    const key = (j.job_title || '').trim().toLowerCase() + '|||' + (j.company_name || '').trim().toLowerCase();
    const rawSet = lookup.get(key);

    if (!rawSet) { noMatch++; if (noMatchSamples.length < 15) noMatchSamples.push(j); continue; }

    if (rawSet.size > 1) {
      // Conflitto: piu' valori raw diversi per lo stesso titolo+azienda in CSV diversi.
      // Non indoviniamo: saltiamo, lasciato per revisione manuale.
      ambiguous++;
      continue;
    }

    const raw = [...rawSet][0];
    const correct = CONTRACT_MAP[raw] || null;

    if (correct === j.contract_type) { unchanged++; continue; }

    await supabase.from('job_listings').update({ contract_type: correct }).eq('id', j.id);
    updated++;
  }

  console.log('\n📊 RISULTATO...');
  console.log(`   ✅ Aggiornati: ${updated}`);
  console.log(`   ⚪ Già corretti: ${unchanged}`);
  console.log(`   ❌ Nessuna corrispondenza nei CSV (altra fonte di import): ${noMatch}`);
  console.log(`   ⚠️  Ambigui (valori diversi tra CSV): ${ambiguous}`);

  console.log('\n   Esempi senza corrispondenza:');
  noMatchSamples.forEach(j => console.log(`      "${j.job_title}" — ${j.company_name} — contract_type attuale: ${j.contract_type}`));

  console.log('\n📊 DISTRIBUZIONE FINALE contract_type...');
  const { data: final } = await supabase.from('job_listings').select('contract_type');
  const dist = new Map();
  final.forEach(j => { const v = j.contract_type || 'NULL'; dist.set(v, (dist.get(v)||0)+1); });
  Array.from(dist.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   "${v}": ${c}`));

  console.log('\n' + '═'.repeat(90));
}
run();
