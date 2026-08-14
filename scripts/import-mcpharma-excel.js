import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SOURCE = 'CRM MC Pharma (excel 2026-08-14)';

// Stessa normalizzazione usata nel sistema anti-duplicati (index.html) e nel merge companies
function normalize(name) {
  if (!name) return '';
  let n = name.toLowerCase();
  n = n.replace(/\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|s\.?t\.?p\.?|ltd|inc|italia|italy|s\.?u\.?|società|per azioni|a responsabilità limitata|unipersonale)\b/gi, '');
  n = n.replace(/[.,'’\-–—()|]/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

// Ripulisce le email del CRM: formati tipo "Nome <email>", email multiple separate
// da spazio nello stesso campo, virgolette residue, spazi/pipe finali. Se dopo la
// pulizia non resta un'email valida, ritorna null piuttosto che inventare/forzare.
function cleanEmail(raw) {
  if (!raw) return null;
  let e = String(raw).trim().replace(/^'+|'+$/g, '').trim();
  const angleMatch = e.match(/<([^>]+)>/);
  if (angleMatch) e = angleMatch[1].trim();
  e = e.split(/\s+/)[0]; // se ci sono più indirizzi separati da spazio, tiene il primo
  e = e.replace(/[|,;]+$/, '').trim();
  return EMAIL_RE.test(e) ? e : null;
}

function extractDomain(website) {
  if (!website) return null;
  try {
    const url = website.match(/^https?:\/\//) ? website : 'https://' + website;
    return new URL(url).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

async function run() {
  console.log('📥 IMPORT dati da CRM MC Pharma (Excel) verso Supabase\n');
  console.log('═'.repeat(90));

  const rows = JSON.parse(fs.readFileSync(new URL('./mcpharma-export.json', import.meta.url), 'utf8'));
  console.log(`Righe nel file Excel: ${rows.length}`);

  const { data: companies } = await supabase.from('companies').select('id, name, ragione_sociale, website, iva');
  const byNorm = new Map();
  companies.forEach(c => {
    const k1 = normalize(c.name);
    if (k1 && !byNorm.has(k1)) byNorm.set(k1, c);
    const k2 = normalize(c.ragione_sociale);
    if (k2 && !byNorm.has(k2)) byNorm.set(k2, c);
  });

  const { data: existingContacts } = await supabase.from('company_contacts').select('company_id, nome');
  const contactKey = (companyId, nome) => companyId + '::' + normalize(nome);
  const existingContactSet = new Set(existingContacts.map(c => contactKey(c.company_id, c.nome)));

  let matched = 0, unmatched = 0, companiesUpdated = 0, contactsInserted = 0, contactsSkippedDup = 0;
  const unmatchedList = [];
  const contactsToInsert = [];

  for (const row of rows) {
    const key1 = normalize(row['Ragione sociale completa']);
    const key2 = normalize(row['Ragione sociale precisa']);
    const company = byNorm.get(key1) || byNorm.get(key2);

    if (!company) {
      unmatched++;
      unmatchedList.push(row['Ragione sociale completa']);
      continue;
    }
    matched++;

    // 1. Aggiorna companies: solo campi mancanti, mai sovrascrive dati esistenti
    const patch = {};
    if (!company.website && row['Sito azienda']) patch.website = row['Sito azienda'];
    if (!company.iva && row['P.IVA']) patch.iva = String(row['P.IVA']);
    if (Object.keys(patch).length) {
      await supabase.from('companies').update(patch).eq('id', company.id);
      companiesUpdated++;
    }

    // 2. Decision maker: Referente + Firmatario (se persone reali e distinte)
    const candidates = [];
    if (row['Referente'] && row['Referente'] !== 'Contatto da definire') {
      candidates.push({
        nome: row['Referente'],
        ruolo: row['Ruolo referente'] === 'Ruolo non indicato' ? null : row['Ruolo referente'],
        email: cleanEmail(row['Mail referente']),
        telefono: row['Telefono'] || null,
      });
    }
    if (row['Firmatario'] && normalize(row['Firmatario']) !== normalize(row['Referente'])) {
      candidates.push({
        nome: row['Firmatario'],
        ruolo: row['Ruolo firmatario'] || null,
        email: cleanEmail(row['Mail firmatario']),
        telefono: null,
      });
    }

    for (const c of candidates) {
      const k = contactKey(company.id, c.nome);
      if (existingContactSet.has(k)) { contactsSkippedDup++; continue; }
      existingContactSet.add(k);
      contactsToInsert.push({
        company_id: company.id,
        nome: c.nome,
        ruolo: c.ruolo,
        email: c.email,
        telefono: c.telefono,
        fonte_scoperta: SOURCE,
        verificato: true,
      });
    }
  }

  console.log(`\nAziende trovate nel DB (match): ${matched}`);
  console.log(`Aziende NON trovate nel DB (saltate, non create): ${unmatched}`);
  console.log(`Aziende aggiornate (sito web / P.IVA mancanti riempiti): ${companiesUpdated}`);
  console.log(`Contatti da inserire: ${contactsToInsert.length} (duplicati già presenti saltati: ${contactsSkippedDup})`);

  const BATCH = 500;
  let rowErrors = 0;
  for (let i = 0; i < contactsToInsert.length; i += BATCH) {
    const chunk = contactsToInsert.slice(i, i + BATCH);
    const { error } = await supabase.from('company_contacts').insert(chunk);
    if (!error) { contactsInserted += chunk.length; continue; }
    // Batch fallita: isola le righe valide inserendo una alla volta
    console.log(`   ⚠️  Batch ${i} fallita (${error.message}), retry riga per riga...`);
    for (const row of chunk) {
      const { error: rowErr } = await supabase.from('company_contacts').insert(row);
      if (rowErr) { rowErrors++; console.log(`      ❌ scartata "${row.nome}": ${rowErr.message}`); }
      else contactsInserted++;
    }
  }
  if (rowErrors) console.log(`   Righe scartate definitivamente: ${rowErrors}`);
  console.log(`Contatti inseriti con successo: ${contactsInserted}`);

  fs.writeFileSync(
    new URL('./mcpharma-unmatched-companies.txt', import.meta.url),
    unmatchedList.join('\n'),
    'utf8'
  );
  console.log(`\n📄 Elenco aziende non trovate salvato in scripts/mcpharma-unmatched-companies.txt (${unmatchedList.length} righe)`);

  console.log('\n' + '═'.repeat(90));
  console.log('✅ Import completato');
}
run();
