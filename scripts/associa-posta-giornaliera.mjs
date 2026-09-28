/**
 * POSTA (INVIATA O RICEVUTA) · ABBINAMENTO GIORNALIERO A company_email_log
 * =============================================================================
 * Seconda meta' della scansione giornaliera "ultimo contatto" richiesta da
 * Mauro il 28/09/2026, poi estesa alle risposte ricevute e al conteggio
 * mensile delle comunicazioni: uno dei due script PowerShell
 * (scansione-posta-inviata.ps1 = Posta Inviata, scansione-posta-ricevuta.ps1
 * = Posta in Arrivo) scarica da Outlook le email degli ultimi giorni in un
 * JSON temporaneo FUORI dal repository (%TEMP%, mai committato — contiene
 * indirizzi email reali), poi QUESTO script:
 *   1. abbina ogni controparte (destinatario se inviata, mittente se
 *      ricevuta) a un'azienda del database per dominio
 *   2. scrive in company_email_log (una riga per email/controparte/azienda)
 *   3. cancella il JSON temporaneo
 *
 * Uso:
 *   node scripts/associa-posta-giornaliera.mjs --direzione=inviata            misura
 *   node scripts/associa-posta-giornaliera.mjs --direzione=inviata --apply    scrive davvero
 *   node scripts/associa-posta-giornaliera.mjs --direzione=ricevuta [--apply]
 *
 * ABBINAMENTO — stesso principio gia' verificato e corretto in questa sessione
 * per l'import Sent Mail/LinkedIn: MAI un fallback largo ("dominio contiene
 * parola del nome azienda"), solo uguaglianza stretta su 3 livelli, in ordine:
 *   1. dominio della controparte === dominio di companies.website
 *   2. dominio (senza TLD, trattini tolti) === nome azienda normalizzato,
 *      tutte le parole concatenate
 *   3. dominio (senza TLD) === UN singolo token del nome azienda (>3 caratteri),
 *      solo se e' l'unica azienda a soddisfare questo confronto (ambiguo -> salta)
 * Un fallback "contiene" era stato provato e scartato in questa sessione per
 * falsi positivi su parole generiche ("consulting", "innovation") — qui non si
 * ripete lo stesso errore.
 *
 * Le mail personali (gmail, libero, ecc.) e il dominio interno di MC Pharma
 * sono sempre escluse, mai considerate contatto di un'azienda cliente.
 */

import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', D = '\x1b[2m', B = '\x1b[1m', Z = '\x1b[0m';

const APPLY = process.argv.includes('--apply');
const argDirezione = process.argv.find((a) => a.startsWith('--direzione='));
const DIREZIONE = argDirezione ? argDirezione.split('=')[1] : 'inviata';
if (!['inviata', 'ricevuta'].includes(DIREZIONE)) throw new Error(`--direzione deve essere "inviata" o "ricevuta", ricevuto "${DIREZIONE}"`);
const DUMP_PATH = join(tmpdir(), `ls-intelligence-posta-${DIREZIONE}.json`);

const env = (n) => (readFileSync(join(ROOT, '.env'), 'utf8').match(new RegExp('^\\s*' + n + '=(.*)$', 'm')) || [])[1]?.trim();
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const ANON = html.match(/eyJhbGciOiJIUzI1NiIs[A-Za-z0-9_.-]{40,}/)[0];
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const SB = (env('SUPABASE_URL') || '').replace(/\/+$/, '') + '/rest/v1';

async function sb(path, init = {}) {
  const k = init.method && init.method !== 'GET' ? SERVICE : ANON;
  const r = await fetch(`${SB}/${path}`, { ...init, headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`Supabase HTTP ${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

async function apiPaginato(path, pageSize = 5000) {
  let risultati = [], offset = 0;
  const sep = path.includes('?') ? '&' : '?';
  while (true) {
    const pagina = await sb(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    risultati.push(...pagina);
    if (pagina.length < pageSize) break;
    offset += pageSize;
  }
  return risultati;
}

// ── stessa normalizzazione nome-azienda gia' in uso in index.html / script arricchimento ──
function normalizeCompanyName(name) {
  if (!name) return '';
  let n = name.toLowerCase();
  n = n.replace(/\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|s\.?t\.?p\.?|ltd|inc|italia|italy|s\.?u\.?|società|per azioni|a responsabilità limitata|unipersonale|in breve.*|o .*società.*)\b/gi, '');
  n = n.replace(/[.,'’\-–—()]/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

const DOMINI_PERSONALI = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.it', 'hotmail.com', 'hotmail.it', 'outlook.com', 'outlook.it',
  'live.com', 'live.it', 'icloud.com', 'me.com', 'alice.it', 'libero.it', 'virgilio.it', 'tiscali.it',
  'aol.com', 'msn.com', 'ymail.com', 'gmx.com', 'gmx.net', 'protonmail.com', 'fastwebnet.it', 'tin.it',
  'email.it', 'mail.com', 'pec.it', 'legalmail.it', 'mcpharmaconsulting.it',
]);

function dominioDi(email) {
  const m = /@([^@>\s]+)$/.exec(String(email).trim().toLowerCase());
  return m ? m[1].replace(/^www\./, '') : null;
}

console.log(`\n${B}Posta (${DIREZIONE}) → company_email_log${Z}`);
console.log(`${D}${APPLY ? 'SCRIVE su Supabase' : 'solo misura, nessuna scrittura'}${Z}\n`);

if (!existsSync(DUMP_PATH)) {
  console.log(`${R}Nessun dump trovato in ${DUMP_PATH} — lanciare prima lo script PowerShell di scansione${Z}\n`);
  process.exit(1);
}

// Out-File -Encoding utf8 di PowerShell scrive con BOM, che JSON.parse non toglie da solo.
const email = JSON.parse(readFileSync(DUMP_PATH, 'utf8').replace(/^﻿/, ''));
// Cancellato subito dopo la lettura, non solo in caso di successo: contiene indirizzi
// email reali e non deve sopravvivere in %TEMP% anche se il resto dello script fallisce.
unlinkSync(DUMP_PATH);
console.log(`${D}email lette dal dump: ${email.length}${Z} (dump temporaneo gia' cancellato)`);

const companies = await apiPaginato('companies?select=id,name,website&is_active=eq.true&merged_into=is.null');

const perDominioSito = new Map();
const perNomeCompleto = new Map();
const perToken = new Map(); // token -> Set(company_id) per rilevare ambiguità

for (const c of companies) {
  if (c.website) {
    const d = dominioDi('x@' + c.website.replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
    if (d && !perDominioSito.has(d)) perDominioSito.set(d, c.id);
  }
  const norm = normalizeCompanyName(c.name);
  if (!norm) continue;
  const concatenato = norm.replace(/\s+/g, '');
  if (concatenato.length > 3 && !perNomeCompleto.has(concatenato)) perNomeCompleto.set(concatenato, c.id);
  for (const tok of norm.split(' ')) {
    if (tok.length <= 3) continue;
    if (!perToken.has(tok)) perToken.set(tok, new Set());
    perToken.get(tok).add(c.id);
  }
}

function trovaAzienda(dominio) {
  if (perDominioSito.has(dominio)) return perDominioSito.get(dominio);
  const brand = dominio.replace(/\.[a-z.]+$/, '');
  // Anche senza trattini: un dominio come "farmila-thea.it" va confrontato con
  // "Farmila-Thea" normalizzato a "farmilathea" (normalizeCompanyName toglie i
  // trattini), non solo con "farmila-thea" letterale.
  const brandSenzaTrattini = brand.replace(/-/g, '');
  if (perNomeCompleto.has(brand)) return perNomeCompleto.get(brand);
  if (perNomeCompleto.has(brandSenzaTrattini)) return perNomeCompleto.get(brandSenzaTrattini);
  if (perToken.has(brand) && perToken.get(brand).size === 1) return [...perToken.get(brand)][0];
  return null;
}

const righe = [];
let ignoratePersonali = 0, nonAbbinate = 0;
const domainNonAbbinati = new Map();

for (const msg of email) {
  // Stesso campo "contatti" in entrambi i dump: per inviata sono i destinatari
  // (To+CC), per ricevuta e' il solo mittente — cosi' il resto della funzione
  // (abbinamento dominio->azienda) non deve sapere in quale direzione e'.
  const contatti = Array.isArray(msg.contatti) ? msg.contatti : [];
  for (const contatto of contatti) {
    const dominio = dominioDi(contatto);
    if (!dominio) continue;
    if (DOMINI_PERSONALI.has(dominio)) { ignoratePersonali++; continue; }
    const companyId = trovaAzienda(dominio);
    if (!companyId) {
      nonAbbinate++;
      domainNonAbbinati.set(dominio, (domainNonAbbinati.get(dominio) || 0) + 1);
      continue;
    }
    righe.push({
      company_id: companyId,
      controparte_email: contatto.toLowerCase(),
      oggetto: msg.oggetto || null,
      data_invio: msg.dataInvio,
      direzione: DIREZIONE,
    });
  }
}

const aziendeToccate = new Set(righe.map((r) => r.company_id));
console.log(`${D}contatti abbinati a un'azienda: ${righe.length} (${aziendeToccate.size} aziende distinte)${Z}`);
console.log(`${D}contatti su domini personali/interni ignorati: ${ignoratePersonali}${Z}`);
console.log(`${D}contatti non abbinati a nessuna azienda: ${nonAbbinate}${Z}`);
if (nonAbbinate > 0) {
  const top = [...domainNonAbbinati.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`${D}  domini non abbinati più frequenti: ${top.map(([d, n]) => `${d} (${n})`).join(', ')}${Z}`);
}

// Niente process.exit() qui: su questa versione di Node, uscire subito dopo
// una fetch lascia gli handle di rete a meta' chiusura e libuv va in crash
// con un assertion error innocuo ma rumoroso nei log. Si lascia semplicemente
// che lo script arrivi in fondo (if invece di return anticipato).
if (!APPLY) {
  console.log(`\n${Y}solo misura: nessuna scrittura su Supabase. Rilancia con --apply per scrivere davvero.${Z}\n`);
} else {
  let scritte = 0, errori = 0;
  for (let i = 0; i < righe.length; i += 200) {
    const lotto = righe.slice(i, i + 200);
    try {
      await sb('company_email_log?on_conflict=company_id,controparte_email,data_invio,direzione', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(lotto),
      });
      scritte += lotto.length;
    } catch (e) {
      errori++;
      console.log(`${R}lotto ${i}-${i + lotto.length}: ${String(e.message).slice(0, 150)}${Z}`);
    }
  }
  console.log(`\n${G}righe inviate a company_email_log: ${scritte}${Z} (duplicati già presenti ignorati automaticamente) · errori lotto: ${errori}\n`);
}
