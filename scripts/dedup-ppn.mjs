/**
 * DEDUP delle aziende create da Pharma Pro Net
 * =============================================================================
 *   node scripts/dedup-ppn.mjs            diagnosi (non scrive)
 *   node scripts/dedup-ppn.mjs --apply    elimina i duplicati ad ALTA confidenza
 *                                         (nome-core identico), dopo aver
 *                                         travasato territorio/descrizione sul
 *                                         record preesistente se mancanti.
 *   node scripts/dedup-ppn.mjs --apply --anche-medi   elimina anche i MEDI
 *                                         (sottoinsieme di parole, univoco).
 *
 * I MEDI di default NON vengono toccati: sono i piu' a rischio di falso
 * positivo (eliminare un'azienda realmente nuova). Vengono elencati per
 * revisione. Elimina solo le righe create da PPN (research_notes "creata da
 * mappa"); mai i record preesistenti.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config();

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APPLY = process.argv.includes('--apply');
const ANCHE_MEDI = process.argv.includes('--anche-medi');
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', D = '\x1b[2m', Z = '\x1b[0m';

const envFile = (n) => (readFileSync(join(ROOT, '.env'), 'utf8').match(new RegExp('^\\s*' + n + '=(.*)$', 'm')) || [])[1]?.trim();
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || envFile('SUPABASE_SERVICE_ROLE_KEY');
const SB = (process.env.SUPABASE_URL || envFile('SUPABASE_URL') || '').replace(/\/+$/, '') + '/rest/v1';
async function sb(path, init = {}) {
  const r = await fetch(`${SB}/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const RUMORE = new Set(['srl', 'srls', 'spa', 'sas', 'snc', 'sb', 'italia', 'italy', 'group', 'the', 'di', 'srl.', 'spa.']);
// core = identita': tutti i token tranne le forme giuridiche (TIENE le sigle
// come S.I.T./C.T./S&R, altrimenti aziende diverse collassano sullo stesso nome)
const core = (s) => norm(s).split(' ').filter(w => w && !RUMORE.has(w)).join(' ');
const tok = (s) => norm(s).split(' ').filter(w => w.length >= 4 && !RUMORE.has(w));
const sub = (x, y) => x.length && x.every(w => y.includes(w));

async function main() {
  console.log(`${D}Dedup aziende PPN — ${APPLY ? (ANCHE_MEDI ? 'APPLY + medi' : 'APPLY (solo alti)') : 'diagnosi'}${Z}`);
  const all = (await sb('companies?select=id,name,province,region,descrizione_aziendale,research_notes,created_at&merged_into=is.null'))
    .map(a => ({ ...a, ckey: core(a.name), tk: tok(a.name), ppn: /creata da mappa/.test(a.research_notes || '') }));
  const nuove = all.filter(a => a.ppn);
  const pre = all.filter(a => !a.ppn);
  console.log(`PPN create ${nuove.length} · preesistenti ${pre.length}`);

  const alti = [], medi = [];
  for (const P of nuove) {
    // tier 1: nome-core identico
    const t1 = pre.filter(E => E.ckey && E.ckey === P.ckey);
    if (t1.length === 1) { alti.push({ P, E: t1[0] }); continue; }
    if (t1.length > 1) { alti.push({ P, E: t1[0], multi: t1.length }); continue; }
    // tier 2: sottoinsieme di parole, univoco, con almeno un token distintivo >=5
    if (!P.tk.length) continue;
    const cand = pre.filter(E => E.tk.length && (sub(P.tk, E.tk) || sub(E.tk, P.tk)) && P.tk.some(w => w.length >= 5 && E.tk.includes(w)));
    if (cand.length === 1) medi.push({ P, E: cand[0] });
  }
  console.log(`${Y}Duplicati soffici — ALTI (nome-core identico): ${alti.length} · MEDI (sottoinsieme parole): ${medi.length}${Z}`);
  const mostra = (arr, n) => arr.slice(0, n).forEach(({ P, E, multi }) => console.log(`  ${D}elimina${Z} "${P.name}"  ${D}->${Z} tieni "${E.name}"${multi ? ` ${R}(${multi} candidati)${Z}` : ''}`));
  console.log(`${D}-- ALTI --${Z}`); mostra(alti, 40);
  console.log(`${D}-- MEDI (solo revisione) --${Z}`); mostra(medi, 40);

  if (!APPLY) { console.log(`${Y}diagnosi: nessuna eliminazione.${Z}`); return; }

  const daEliminare = ANCHE_MEDI ? [...alti, ...medi] : alti;
  let travasi = 0, elim = 0, falliti = 0;
  for (const { P, E } of daEliminare) {
    // travaso territorio/descrizione sul record che resta, se mancante
    const patch = {};
    if (!E.province && P.province) patch.province = P.province;
    if (!E.region && P.region) patch.region = P.region;
    if (!E.descrizione_aziendale && P.descrizione_aziendale) patch.descrizione_aziendale = P.descrizione_aziendale;
    if (Object.keys(patch).length) { await sb(`companies?id=eq.${E.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) }); travasi++; }
    try { await sb(`companies?id=eq.${P.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); elim++; }
    catch (e) { falliti++; console.log(`${R}non eliminata ${P.name}: ${e.message}${Z}`); }
  }
  console.log(`${G}Eliminate ${elim} · territorio travasato su ${travasi} · fallite ${falliti}${Z}`);
}
main().catch(e => { console.error(`${R}${e.stack || e.message}${Z}`); process.exit(1); });
