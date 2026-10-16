/**
 * AGENTE DI TRACCIAMENTO SCAMBI EMAIL → LS JOB INTELLIGENCE (richiesta Mauro 16/10/2026)
 * =============================================================================
 * Legge il dump prodotto da scripts/scansione-posta-thread.ps1 (Posta Inviata +
 * in Arrivo dal 1/09/2026, con corpo nuovo e topic di conversazione), abbina
 * ogni scambio a un'azienda del TUO account e raggruppa le email per THREAD.
 *
 * Questo file, per ora, fa SOLO lo Step 0 a costo zero: scansione + abbinamento +
 * raggruppamento + conteggio (nessuna AI, nessuna scrittura). Serve a vedere il
 * perimetro reale prima di spendere un centesimo in estrazione.
 *   node scripts/agente-posta-estrai.mjs                 (dry-run: conta e mostra)
 *   node scripts/agente-posta-estrai.mjs --account=Mauro (default: Mauro)
 *
 * Perimetro deciso da Mauro: aziende con cui scrive, sul suo account.
 * Abbinamento dominio→azienda: stessa logica stretta di
 * scripts/associa-posta-giornaliera.mjs (nessun fallback "contiene").
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', D = '\x1b[2m', B = '\x1b[1m', Z = '\x1b[0m';

const argAccount = process.argv.find((a) => a.startsWith('--account='));
const ACCOUNT = argAccount ? argAccount.split('=')[1] : 'Mauro';
const SOLO_SCAMBI = process.argv.includes('--scambi'); // solo thread con risposta o >1 invio
const argMd = process.argv.find((a) => a.startsWith('--md='));
const MD_PATH = argMd ? argMd.split('=')[1] : null;
const DUMP_PATH = join(tmpdir(), 'ls-intelligence-posta-thread.json');
const eScambioReale = (t) => t.ricevute >= 1 || t.inviate >= 2;

const env = (n) => (readFileSync(join(ROOT, '.env'), 'utf8').match(new RegExp('^\\s*' + n + '=(.*)$', 'm')) || [])[1]?.trim();
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const ANON = html.match(/eyJhbGciOiJIUzI1NiIs[A-Za-z0-9_.-]{40,}/)[0];
const SB = (env('SUPABASE_URL') || '').replace(/\/+$/, '') + '/rest/v1';

async function sb(path) {
  const r = await fetch(`${SB}/${path}`, { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
  if (!r.ok) throw new Error(`Supabase HTTP ${r.status} ${path}: ${(await r.text()).slice(0, 160)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function apiPaginato(path, pageSize = 5000) {
  let out = [], offset = 0; const sep = path.includes('?') ? '&' : '?';
  while (true) {
    const p = await sb(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    out.push(...p); if (p.length < pageSize) break; offset += pageSize;
  }
  return out;
}

function normalizeCompanyName(name) {
  if (!name) return '';
  let n = name.toLowerCase();
  n = n.replace(/\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|s\.?t\.?p\.?|ltd|inc|italia|italy|s\.?u\.?|società|per azioni|a responsabilità limitata|unipersonale|in breve.*|o .*società.*)\b/gi, '');
  n = n.replace(/[.,'’\-–—()]/g, ' ').replace(/\s+/g, ' ').trim();
  return n;
}
const DOMINI_PERSONALI = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.it', 'hotmail.com', 'hotmail.it', 'outlook.com', 'outlook.it',
  'live.com', 'live.it', 'icloud.com', 'me.com', 'alice.it', 'libero.it', 'virgilio.it', 'tiscali.it',
  'aol.com', 'msn.com', 'ymail.com', 'gmx.com', 'gmx.net', 'protonmail.com', 'fastwebnet.it', 'tin.it',
  'email.it', 'mail.com', 'pec.it', 'legalmail.it', 'mcpharmaconsulting.it',
  'ethovix.com', 'carvisiglia.com', 'studiocommercialistafois.it', 'bper.it', 'vocations.io',
  'linkedin.com', 'mailpool.io',
]);
const dominioDi = (email) => {
  const m = /@([^@>\s]+)$/.exec(String(email).trim().toLowerCase());
  return m ? m[1].replace(/^www\./, '') : null;
};
// Fuori perimetro commerciale: amministrazione/contabilità, candidature, servizi.
// Richiesto da Mauro (16/10/2026): tenere solo mail con valenza commerciale
// (richieste di contatto + risposte dei clienti), lasciare fuori fatture ecc.
const RUMORE_RE = /fattur|sollecit|pagament|scadenz|insolut|contabil|nota di credito|bonific|rimbors|quietanz|f24|iban|ded(?:ucibil|uzion)|candidatur|^cv\b|invio cv|colloquio conoscitivo del candidat|linkedin|wetransfer|newsletter|no[-\s]?reply|noreply|posta certificata|ricevuta di accettazione|ricevuta di consegna|conferma.*iscrizione|unsubscribe/i;
const eRumore = (oggetto, conversazione) => RUMORE_RE.test(`${oggetto || ''} ${conversazione || ''}`);

// Normalizza l'oggetto a chiave-thread: toglie i prefissi Re/R/Fwd/I/Fw e simboli.
function threadKey(oggetto, conversazione) {
  const base = (conversazione && conversazione.trim()) ? conversazione : (oggetto || '');
  return base.toLowerCase()
    .replace(/^\s*((re|r|fwd|fw|i|rif|aw|tr)\s*:\s*)+/i, '')
    .replace(/[\[\(].*?[\]\)]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

if (!existsSync(DUMP_PATH)) {
  console.log(`${R}Nessun dump in ${DUMP_PATH} — lancia prima scripts\\scansione-posta-thread.ps1${Z}\n`);
  process.exit(1);
}
const email = JSON.parse(readFileSync(DUMP_PATH, 'utf8').replace(/^﻿/, ''));

console.log(`\n${B}Agente posta → LS Intelligence · DRY-RUN (account ${ACCOUNT})${Z}`);
console.log(`${D}email nel dump: ${email.length} · nessuna AI, nessuna scrittura${Z}\n`);

// Solo le aziende del tuo account (perimetro deciso). L'indice dominio→azienda
// si costruisce da queste + dai loro contatti già noti.
const companies = await apiPaginato(`companies?select=id,name,website&account=eq.${encodeURIComponent(ACCOUNT)}&merged_into=is.null`);
const idAccount = new Set(companies.map((c) => c.id));
const contatti = await apiPaginato('company_contacts?select=company_id,email');

const perDominio = new Map(), perNomeCompleto = new Map(), perToken = new Map(), perEmailNota = new Map();
const add = (map, k, v) => { if (!k) return; if (!map.has(k)) map.set(k, new Set()); map.get(k).add(v); };
for (const c of contatti) {
  if (!c.email || !idAccount.has(c.company_id)) continue;
  add(perEmailNota, c.email.toLowerCase(), c.company_id);
  add(perDominio, dominioDi(c.email), c.company_id);
}
for (const c of companies) {
  add(perDominio, dominioDi('x@' + (c.website || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')), c.id);
  const norm = normalizeCompanyName(c.name); if (!norm) continue;
  const concat = norm.replace(/\s+/g, '');
  if (concat.length > 3 && !perNomeCompleto.has(concat)) perNomeCompleto.set(concat, c.id);
  for (const tok of norm.split(' ')) { if (tok.length > 3) add(perToken, tok, c.id); }
}
const nomePerId = new Map(companies.map((c) => [c.id, c.name]));

function trovaAzienda(dominio, emailCompleta) {
  const noto = perEmailNota.get(emailCompleta.toLowerCase());
  if (noto?.size) return [...noto];
  if (perDominio.has(dominio)) { const c = perDominio.get(dominio); return c.size === 1 ? [...c] : []; }
  const brand = dominio.replace(/\.[a-z.]+$/, ''), brandNT = brand.replace(/-/g, '');
  if (perNomeCompleto.has(brand)) return [perNomeCompleto.get(brand)];
  if (perNomeCompleto.has(brandNT)) return [perNomeCompleto.get(brandNT)];
  if (perToken.has(brand) && perToken.get(brand).size === 1) return [...perToken.get(brand)];
  return [];
}

const threads = new Map(); // `${company_id}||${threadKey}` -> {companyId, nome, soggetto, inviate, ricevute, dal, al}
let personali = 0, fuoriPerimetro = 0, nonAbbinate = 0, abbinate = 0, rumoreScartato = 0;
const dominiFuori = new Map();

for (const msg of email) {
  if (eRumore(msg.oggetto, msg.conversazione)) { rumoreScartato++; continue; }
  // PowerShell ConvertTo-Json serializza una lista di 1 elemento come STRINGA,
  // non come array: le cold email (1 destinatario) arrivavano cosi' e venivano
  // scartate. Si normalizza sempre ad array.
  const contattiMsg = Array.isArray(msg.contatti) ? msg.contatti : (msg.contatti ? [msg.contatti] : []);
  const companyIds = new Set();
  let soloPersonali = true;
  for (const c of contattiMsg) {
    const dom = dominioDi(c); if (!dom) continue;
    if (DOMINI_PERSONALI.has(dom)) continue;
    soloPersonali = false;
    const ids = trovaAzienda(dom, c);
    if (!ids.length) { dominiFuori.set(dom, (dominiFuori.get(dom) || 0) + 1); continue; }
    ids.forEach((id) => companyIds.add(id));
  }
  if (!companyIds.size) {
    if (soloPersonali) personali++; else nonAbbinate++;
    continue;
  }
  abbinate++;
  const tk = threadKey(msg.oggetto, msg.conversazione);
  for (const id of companyIds) {
    const key = `${id}||${tk}`;
    if (!threads.has(key)) threads.set(key, { companyId: id, nome: nomePerId.get(id), soggetto: tk || '(senza oggetto)', inviate: 0, ricevute: 0, dal: msg.dataInvio, al: msg.dataInvio });
    const t = threads.get(key);
    if (msg.direzione === 'inviata') t.inviate++; else t.ricevute++;
    if (msg.dataInvio < t.dal) t.dal = msg.dataInvio;
    if (msg.dataInvio > t.al) t.al = msg.dataInvio;
  }
}

const aziende = new Set([...threads.values()].map((t) => t.companyId));
console.log(`${G}email abbinate ad aziende del tuo account: ${abbinate}${Z}`);
console.log(`${D}  → aziende distinte: ${aziende.size} · thread distinti: ${threads.size}${Z}`);
console.log(`${D}email scartate come non-commerciali (fatture/candidature/servizi): ${rumoreScartato}${Z}`);
console.log(`${D}email solo su domini personali/interni: ${personali}${Z}`);
console.log(`${D}email verso domini fuori dal tuo perimetro / non abbinati: ${nonAbbinate}${Z}`);
if (dominiFuori.size) {
  const top = [...dominiFuori.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`${D}  domini non nel tuo account (primi 12): ${top.map(([d, n]) => `${d}(${n})`).join(', ')}${Z}`);
}

let elenco = [...threads.values()];
const scambiReali = elenco.filter(eScambioReale);
console.log(`${D}di cui scambi reali (risposta o >1 invio): ${scambiReali.length}${Z}`);
if (SOLO_SCAMBI) elenco = scambiReali;

const perAzienda = elenco.reduce((m, t) => { (m[t.nome] ||= []).push(t); return m; }, {});
console.log(`\n${B}${SOLO_SCAMBI ? 'Scambi reali' : 'Thread'} per azienda:${Z}`);
for (const [nome, ts] of Object.entries(perAzienda).sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`${B}${nome}${Z} ${D}(${ts.length})${Z}`);
  for (const t of ts.sort((a, b) => (a.al < b.al ? 1 : -1))) {
    const d1 = t.dal.slice(0, 10), d2 = t.al.slice(0, 10);
    console.log(`  ${D}•${Z} ${t.soggetto.slice(0, 70)} ${D}— ${t.inviate}↗/${t.ricevute}↘ · ${d1}${d1 !== d2 ? '→' + d2 : ''}${Z}`);
  }
}

if (MD_PATH) {
  const base = SOLO_SCAMBI ? scambiReali : [...threads.values()];
  const righeMd = [...base].sort((a, b) => (a.nome === b.nome ? (a.al < b.al ? 1 : -1) : a.nome.localeCompare(b.nome)));
  const conRisposta = base.filter((t) => t.ricevute >= 1).length;
  const out = [];
  out.push(`# Attivita commerciale via email - account ${ACCOUNT}`);
  out.push('');
  out.push(`Dal 1/09/2026. **${base.length} thread commerciali** su **${new Set(base.map((t) => t.companyId)).size} aziende** (escluse fatture/amministrazione/candidature/servizi). Di cui **${conRisposta} con risposta del cliente** e **${base.filter(eScambioReale).length} scambi reali** (risposta o piu' di un invio). La colonna "Risposte" > 0 segnala dove c'e' un dialogo in corso.`);
  out.push('');
  out.push('| Azienda | Oggetto thread | Inviate | Risposte | Periodo |');
  out.push('|---|---|---:|---:|---|');
  for (const t of righeMd) {
    const d1 = t.dal.slice(0, 10), d2 = t.al.slice(0, 10);
    const periodo = d1 === d2 ? d1 : `${d1} -> ${d2}`;
    const sogg = t.soggetto.replace(/\|/g, '/').slice(0, 90);
    out.push(`| ${t.nome} | ${sogg} | ${t.inviate} | ${t.ricevute} | ${periodo} |`);
  }
  writeFileSync(MD_PATH, out.join('\n'), 'utf8');
  console.log(`\n${G}elenco scritto: ${MD_PATH}${Z}`);
}
console.log(`\n${Y}Dry-run: nessuna AI chiamata, nessuna scrittura.${Z}\n`);
