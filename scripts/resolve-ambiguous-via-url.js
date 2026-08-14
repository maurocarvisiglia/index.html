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
  if (!fs.existsSync(path)) return [];
  let content = fs.readFileSync(path, 'utf-8');
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  try {
    return parse(content, { delimiter: ';', columns: true, skip_empty_lines: true, relax_column_count: true });
  } catch (e) { return []; }
}

async function run() {
  console.log('🔎 RISOLUZIONE AMBIGUI VIA URL (chiave esatta)\n');
  console.log('═'.repeat(90));

  // Mappa URL -> Set di valori Contratto grezzi osservati (+ da quale CSV/data)
  const byUrl = new Map();
  let totalRows = 0, rowsWithUrl = 0;

  for (const file of CSV_FILES) {
    const rows = readCsv(file);
    totalRows += rows.length;
    const urlCol = rows.length ? Object.keys(rows[0]).find(c => /^URL$/i.test(c)) : null;
    rows.forEach(r => {
      const url = (r[urlCol] || '').trim();
      const rawContract = (r['Contratto'] || '').trim().toLowerCase();
      const date = (r['Data creazione'] || '').trim();
      if (!url || !rawContract) return;
      rowsWithUrl++;
      if (!byUrl.has(url)) byUrl.set(url, []);
      byUrl.get(url).push({ raw: rawContract, date, file });
    });
  }
  console.log(`Righe CSV totali: ${totalRows} | con URL+Contratto: ${rowsWithUrl}`);
  console.log(`URL distinti: ${byUrl.size}`);

  const urlConflicts = [...byUrl.entries()].filter(([,arr]) => new Set(arr.map(x=>x.raw)).size > 1);
  console.log(`URL con valori Contratto diversi nel tempo (stesso annuncio, dati cambiati): ${urlConflicts.length}`);
  urlConflicts.slice(0, 8).forEach(([url, arr]) => console.log(`   ${url.substring(0,70)}\n      ${arr.map(x=>`${x.raw}(${x.date})`).join(' → ')}`));

  // Carica i job_listings ancora con contract_type sospetto/da rivedere (i 397 ambigui + eventuali altro/null residui)
  console.log('\n🔎 CARICAMENTO job_listings con url...');
  const { data: jobs } = await supabase.from('job_listings').select('id, job_title, company_name, url, contract_type');
  console.log(`Trovati: ${jobs.length}`);

  let resolved = 0, unchanged = 0, noUrlMatch = 0, stillConflicting = 0;

  for (const j of jobs) {
    if (!j.url) { noUrlMatch++; continue; }
    const observations = byUrl.get(j.url.trim());
    if (!observations || !observations.length) { noUrlMatch++; continue; }

    const rawValues = new Set(observations.map(o => o.raw));
    if (rawValues.size > 1) {
      // Stesso URL, valori diversi in export diversi: prendo il piu' recente per data creazione
      const sorted = observations.slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
      const mostRecentRaw = sorted[0].raw;
      const correct = CONTRACT_MAP[mostRecentRaw] ?? null;
      if (correct === j.contract_type) { unchanged++; continue; }
      await supabase.from('job_listings').update({ contract_type: correct }).eq('id', j.id);
      resolved++;
      stillConflicting++; // tracciato separatamente solo per il conteggio "risolto da conflitto"
      continue;
    }

    const raw = [...rawValues][0];
    const correct = CONTRACT_MAP[raw] ?? null;
    if (correct === j.contract_type) { unchanged++; continue; }
    await supabase.from('job_listings').update({ contract_type: correct }).eq('id', j.id);
    resolved++;
  }

  console.log('\n📊 RISULTATO...');
  console.log(`   ✅ Risolti/aggiornati via URL: ${resolved} (di cui da conflitto risolto con la versione più recente: ${stillConflicting})`);
  console.log(`   ⚪ Già corretti: ${unchanged}`);
  console.log(`   ❌ URL senza corrispondenza nei CSV: ${noUrlMatch}`);

  console.log('\n📊 DISTRIBUZIONE FINALE contract_type...');
  const { data: final } = await supabase.from('job_listings').select('contract_type');
  const dist = new Map();
  final.forEach(j => { const v = j.contract_type || 'NULL'; dist.set(v, (dist.get(v)||0)+1); });
  Array.from(dist.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   "${v}": ${c}`));

  console.log('\n' + '═'.repeat(90));
}
run();
