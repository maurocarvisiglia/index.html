/**
 * ASSEGNA ACCOUNT · aziende con contatto + email non ancora assegnate
 * =============================================================================
 *   node scripts/assegna-account.mjs            misura (nessuna scrittura)
 *   node scripts/assegna-account.mjs --apply    scrive companies.account
 *
 * STESSA LOGICA DELLA DIVISIONE DEL 22/09/2026 (351/350/350)
 * Quella divisione era bilanciata su tre grandezze, misurate a posteriori sui
 * dati: numero di aziende, aziende con annunci attivi, aziende grandi. Qui le
 * nuove si dividono per fascia (con/senza annunci attivi × classe di
 * dipendenti) e, dentro ogni fascia, ciascuna va a chi in quella fascia ne ha
 * MENO contando anche le gia' assegnate — cosi' il bilancio vale sul totale,
 * non solo sul lotto nuovo. A parita', a chi ha meno aziende in tutto.
 *
 * Solo aziende senza account: una gia' assegnata non viene mai spostata.
 * Con --apply salva prima in dati-passate/ l'elenco id → account scritto,
 * per poter annullare.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APPLY = process.argv.includes('--apply');
const ACCOUNT = ['Mauro', 'Caterina', 'Sofia'];
const ESCLUDI = ((process.argv.find((x) => x.startsWith('--escludi=')) || '').slice(10)).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const env = (n) => (readFileSync(join(ROOT, '.env'), 'utf8').match(new RegExp('^\\s*' + n + '=(.*)$', 'm')) || [])[1]?.trim();
const K = env('SUPABASE_SERVICE_ROLE_KEY');
const SB = (env('SUPABASE_URL') || '').replace(/\/+$/, '') + '/rest/v1';
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };

async function tutte(path) {
  const out = [];
  for (let o = 0; ; o += 1000) {
    const r = await fetch(`${SB}/${path}&limit=1000&offset=${o}`, { headers: H });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${path}: ${(await r.text()).slice(0, 160)}`);
    const d = await r.json();
    out.push(...d);
    if (d.length < 1000) return out;
  }
}

const contatti = await tutte('company_contacts?select=company_id,email');
const conEmail = new Set(contatti.filter((c) => c.email && c.email.includes('@')).map((c) => c.company_id));
const annunci = {};
for (const j of await tutte('job_listings?select=company_id&is_active=eq.true')) if (j.company_id) annunci[j.company_id] = (annunci[j.company_id] || 0) + 1;
const aziende = (await tutte('companies?select=id,name,account,dipendenti,is_active,merged_into'))
  .filter((a) => a.is_active && !a.merged_into && conEmail.has(a.id))
  // --escludi=nome1,nome2: aziende da lasciare senza account (corrispondenza sul nome, senza maiuscole)
  .filter((a) => !ESCLUDI.some((n) => a.name.toLowerCase().includes(n)));

const classe = (d) => (!d ? 'ignoti' : d >= 250 ? '250+' : d >= 50 ? '50-249' : '<50');
const fascia = (a) => `${annunci[a.id] ? 'con annunci' : 'senza annunci'} · ${classe(+a.dipendenti || 0)}`;

// conteggi di partenza, dalle gia' assegnate
const perFascia = {}, totale = Object.fromEntries(ACCOUNT.map((p) => [p, 0]));
const conta = (f, p) => { (perFascia[f] ||= Object.fromEntries(ACCOUNT.map((x) => [x, 0])))[p]++; totale[p]++; };
for (const a of aziende) if (a.account) conta(fascia(a), a.account);

// le nuove: prima le piu' "pesanti" (piu' annunci, piu' dipendenti)
const nuove = aziende.filter((a) => !a.account)
  .sort((x, y) => (annunci[y.id] || 0) - (annunci[x.id] || 0) || (+y.dipendenti || 0) - (+x.dipendenti || 0) || x.name.localeCompare(y.name));
const assegnate = [];
const EQUO = process.argv.includes('--equo');
const ORDINE_EQUO = [...ACCOUNT].sort((x, y) => totale[x] - totale[y]);
for (const a of nuove) {
  const f = fascia(a);
  perFascia[f] ||= Object.fromEntries(ACCOUNT.map((x) => [x, 0]));
  // --equo: giro a rotazione (le piu' pesanti per prime), partendo da chi ha meno aziende in tutto: 11/10/10 invece del bilanciamento per fascia
  const p = EQUO ? ORDINE_EQUO[assegnate.length % 3] : [...ACCOUNT].sort((x, y) => perFascia[f][x] - perFascia[f][y] || totale[x] - totale[y])[0];
  conta(f, p);
  assegnate.push({ id: a.id, nome: a.name, account: p, fascia: f });
}

// riepilogo
const riep = Object.fromEntries(ACCOUNT.map((p) => [p, { nuove: 0, totale: totale[p], con_annunci: 0, annunci: 0, grandi250: 0 }]));
for (const a of aziende) {
  const p = a.account || assegnate.find((x) => x.id === a.id)?.account;
  if (!p) continue;
  if (annunci[a.id]) { riep[p].con_annunci++; riep[p].annunci += annunci[a.id]; }
  if (+a.dipendenti >= 250) riep[p].grandi250++;
}
for (const x of assegnate) riep[x.account].nuove++;
console.log(`\nAziende con contatto + email: ${aziende.length} · gia' assegnate: ${aziende.length - nuove.length} · da assegnare: ${nuove.length}`);
console.table(riep);

if (!APPLY) {
  console.log('solo misura: nulla scritto. Rilancia con --apply per scrivere.');
} else {
  const backup = join(ROOT, 'dati-passate', `assegnazione-account-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}.json`);
  writeFileSync(backup, JSON.stringify(assegnate, null, 1));
  for (const p of ACCOUNT) {
    const ids = assegnate.filter((x) => x.account === p).map((x) => x.id);
    for (let i = 0; i < ids.length; i += 100) {
      const r = await fetch(`${SB}/companies?id=in.(${ids.slice(i, i + 100).join(',')})&account=is.null`, {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ account: p }),
      });
      if (!r.ok) throw new Error(`PATCH ${p}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
    }
  }
  console.log(`scritte ${assegnate.length} assegnazioni · elenco per annullare: ${backup}`);
}
