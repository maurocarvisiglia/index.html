import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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
  try { return parse(content, { delimiter: ';', columns: true, skip_empty_lines: true, relax_column_count: true }); }
  catch (e) { return []; }
}

async function run() {
  const allUrls = new Set();
  for (const file of CSV_FILES) {
    const rows = readCsv(file);
    const urlCol = rows.length ? Object.keys(rows[0]).find(c => /^URL$/i.test(c)) : null;
    rows.forEach(r => { const u = (r[urlCol]||'').trim(); if (u) allUrls.add(u); });
  }
  console.log(`URL totali nei CSV: ${allUrls.size}`);

  const { data: jobs } = await supabase.from('job_listings').select('id, job_title, company_name, url, contract_type, published_date, source');
  const unmatched = jobs.filter(j => !j.url || !allUrls.has(j.url.trim()));

  console.log(`\nAnnunci senza corrispondenza URL nei CSV: ${unmatched.length}\n`);
  unmatched.forEach(j => {
    console.log(`"${j.job_title}" — ${j.company_name}`);
    console.log(`   url: ${j.url}`);
    console.log(`   contract_type: ${j.contract_type} | published_date: ${j.published_date} | source: ${j.source}`);
    console.log('');
  });
}
run();
