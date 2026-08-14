import fs from 'fs';
import { parse } from 'csv-parse/sync';

const csvPath = 'C:\\Users\\Utente\\Downloads\\vocations-positions-1786438474.csv';
let csvContent = fs.readFileSync(csvPath, 'utf-8');
if (csvContent.charCodeAt(0) === 0xFEFF) csvContent = csvContent.slice(1);
const records = parse(csvContent, { delimiter: ';', columns: true, skip_empty_lines: true });

console.log(`Righe totali: ${records.length}\n`);

// Trova la colonna giusta (potrebbe chiamarsi "Contratto" o simile)
const sampleCols = Object.keys(records[0]);
console.log('Colonne disponibili:', sampleCols.filter(c => /contrat|contract/i.test(c)));

const colName = sampleCols.find(c => /^Contratto$/i.test(c)) || sampleCols.find(c => /contrat/i.test(c));
console.log(`\nUso colonna: "${colName}"\n`);

const dist = new Map();
records.forEach(r => {
  const v = (r[colName] || '').trim() || '(vuoto)';
  dist.set(v, (dist.get(v) || 0) + 1);
});

console.log('Valori distinti nella colonna Contratto:');
Array.from(dist.entries()).sort((a,b) => b[1]-a[1]).forEach(([v,c]) => console.log(`   "${v}": ${c}`));

// contractMap attuale nel codice (chiavi minuscole)
const contractMap = {permanent:'TI', contract:'TD', temporary:'TD', internship:'Stage', apprenticeship:'TI', freelance:'Agenzia', 'n/a':'altro'};
console.log('\n\nQuali valori NON sono coperti dalla mappa attuale (case-insensitive, trim)?');
const uncovered = new Map();
records.forEach(r => {
  const raw = (r[colName] || '').trim().toLowerCase();
  if (!contractMap[raw]) {
    const orig = (r[colName] || '').trim() || '(vuoto)';
    uncovered.set(orig, (uncovered.get(orig)||0)+1);
  }
});
Array.from(uncovered.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   "${v}": ${c}`));
