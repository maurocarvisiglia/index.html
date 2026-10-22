/**
 * ARRICCHIMENTO TERRITORIO · mappa pubblica Pharma Pro Net
 * =============================================================================
 *   node scripts/arricchimento-ppn.mjs           misura, non scrive (dry-run)
 *   node scripts/arricchimento-ppn.mjs --apply    arricchisce + crea nuove
 *
 * FONTE: https://pharmapronet-mappe-italia-aziende.netlify.app/ (dato pubblico,
 * mappa curata di aziende life science in Italia). L'array AZIENDE e' embeddato
 * nella pagina: {regione: [{n:nome, c:"Comune (PV)", cat:settore, d:descr}]}.
 * Estrazione del solo literal dati in sandbox vm (nessun accesso a fs/rete).
 *
 * COSA FA
 *   · per ogni azienda abbina all'anagrafica in modo conservativo (come
 *     scansione-annunci-isf.mjs: esatto -> nome-core -> contenimento parole);
 *   · se province/region sono vuoti, li riempie (sigla provincia + regione);
 *   · traccia la provenienza in research_notes ([PPN gg/mm/aaaa] ... Pharma Pro Net);
 *   · le aziende non presenti in anagrafica vengono CREATE (dato pubblico, ok Mauro).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import dotenv from 'dotenv';
dotenv.config();

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const APPLY = process.argv.includes('--apply');
const OGGI = new Date().toLocaleDateString('it-IT');
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', D = '\x1b[2m', Z = '\x1b[0m';
const URL = 'https://pharmapronet-mappe-italia-aziende.netlify.app/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const envFile = (n) => (readFileSync(join(ROOT, '.env'), 'utf8').match(new RegExp('^\\s*' + n + '=(.*)$', 'm')) || [])[1]?.trim();
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || envFile('SUPABASE_SERVICE_ROLE_KEY');
const SB = (process.env.SUPABASE_URL || envFile('SUPABASE_URL') || '').replace(/\/+$/, '') + '/rest/v1';
async function sb(path, init = {}) {
  const r = await fetch(`${SB}/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

// --- estrazione sicura del literal AZIENDE={...} dal sorgente della pagina ---
function estraiAziende(html) {
  const i = html.search(/const\s+AZIENDE\s*=/);
  if (i < 0) throw new Error('AZIENDE non trovato nella pagina');
  let j = html.indexOf('{', i); let depth = 0, inStr = false, q = '', esc = false;
  for (let k = j; k < html.length; k++) {
    const ch = html[k];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === q) inStr = false; }
    else if (ch === '"' || ch === "'") { inStr = true; q = ch; }
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { const lit = html.slice(j, k + 1); return vm.runInNewContext('(' + lit + ')', Object.create(null), { timeout: 2000 }); } }
  }
  throw new Error('literal AZIENDE non bilanciato');
}

const CAT2SECT = { farmaceutica: 'Pharma', biotech: 'Biotech', medical_device: 'Medical Devices', cosmetica: 'Cosmetics', integratori: 'Nutraceutical', alimentare: 'Food', sanitario: 'Healthcare Services', cro_consulenza: 'CRO' };

// --- matching conservativo (come scansione-annunci-isf) ---
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const RUMORE = new Set(['srl', 'srls', 'spa', 'sas', 'snc', 'sb', 'italia', 'italy', 'group', 'the', 'di', 'srl.']);
const core = (s) => norm(s).split(' ').filter(w => w.length >= 2 && !RUMORE.has(w)).join(' ');
const tok = (s) => norm(s).split(' ').filter(w => w.length >= 4 && !RUMORE.has(w));
// toglie il qualificatore di sede tra parentesi dal nome: "Alfasigma (Alanno)" -> "Alfasigma"
const puliscoNome = (n) => (n || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
function abbina(nome, aziende) {
  const n = norm(nome); const esatto = aziende.find(a => a.n === n); if (esatto) return esatto;
  const c = core(nome); if (c) { const p = aziende.filter(a => a.c === c); if (p.length === 1) return p[0]; if (p.length > 1) return null; }
  const ta = tok(nome); if (!ta.length) return null;
  const sub = (x, y) => x.every(w => y.includes(w));
  const cand = aziende.filter(a => a.t.length && (sub(ta, a.t) || sub(a.t, ta)));
  return cand.length === 1 ? cand[0] : null;
}

async function main() {
  console.log(`${D}Arricchimento territorio da Pharma Pro Net — ${APPLY ? 'APPLY' : 'dry-run'}${Z}`);
  const html = await (await fetch(URL, { headers: { 'User-Agent': UA } })).text();
  const MAP = estraiAziende(html);
  // flatten + dedup per azienda (stesso nome pulito -> prima sede)
  const perAz = new Map();
  let sedi = 0;
  for (const reg of Object.keys(MAP)) for (const az of MAP[reg]) {
    sedi++;
    const nome = puliscoNome(az.n); if (!nome) continue;
    const key = norm(nome);
    const prov = (String(az.c || '').match(/\(([A-Za-z]{2})\)\s*$/) || [])[1] || null;
    const comune = String(az.c || '').replace(/\s*\([A-Za-z]{2}\)\s*$/, '').trim() || null;
    if (!perAz.has(key)) perAz.set(key, { nome, regione: reg, provincia: prov ? prov.toUpperCase() : null, comune, cat: az.cat, descr: az.d || null });
  }
  const aziendePPN = [...perAz.values()];
  console.log(`Sedi lette ${sedi} · aziende distinte ${aziendePPN.length}`);

  const db = (await sb('companies?select=id,name,province,region,research_notes,descrizione_aziendale&merged_into=is.null'))
    .map(a => ({ ...a, n: norm(a.name), c: core(a.name), t: tok(a.name) }));

  let abbinate = 0, provinciaDaRiempire = 0, regionDaRiempire = 0, nuove = [];
  const updates = [];
  for (const p of aziendePPN) {
    const m = abbina(p.nome, db);
    if (!m) { nuove.push(p); continue; }
    abbinate++;
    if (m.research_notes && m.research_notes.includes('[PPN')) continue;  // gia' arricchita, idempotente
    const u = { id: m.id };
    if (!m.province && p.provincia) { u.province = p.provincia; provinciaDaRiempire++; }
    if (!m.region && p.regione) { u.region = p.regione; regionDaRiempire++; }
    if (!m.descrizione_aziendale && p.descr) u.descrizione_aziendale = p.descr;
    const nota = `[PPN ${OGGI}] ${[p.comune, p.provincia].filter(Boolean).join(' ')} · ${p.cat} — mappa Pharma Pro Net (dato pubblico)`;
    u.research_notes = (m.research_notes ? m.research_notes + ' | ' : '') + nota;
    if (u.province || u.region || u.descrizione_aziendale) updates.push(u);
  }

  console.log(`Abbinate ${abbinate} · province da riempire ${provinciaDaRiempire} · region da riempire ${regionDaRiempire}`);
  const perCatNuove = {}; for (const x of nuove) perCatNuove[x.cat] = (perCatNuove[x.cat] || 0) + 1;
  console.log(`Nuove da creare ${nuove.length} ${D}${JSON.stringify(perCatNuove)}${Z}`);

  if (!APPLY) {
    console.log(`${Y}dry-run: nessuna scrittura.${Z}`);
    console.log('Esempi arricchimento:', updates.slice(0, 5).map(u => ({ prov: u.province, reg: u.region })));
    console.log('Esempi nuove:', nuove.slice(0, 8).map(x => `${x.nome} [${x.cat}] ${x.comune || ''} ${x.provincia || ''}`));
    return;
  }

  // 1) arricchimento aziende esistenti
  let scritte = 0;
  for (const u of updates) {
    const { id, ...body } = u;
    await sb(`companies?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    scritte++;
  }
  // 2) creazione nuove
  const righeNuove = nuove.map(p => ({
    name: p.nome, entity_type: 'life_sciences', sector_v2: CAT2SECT[p.cat] || null,
    province: p.provincia, region: p.regione, descrizione_aziendale: p.descr, is_active: true,
    research_notes: `[PPN ${OGGI}] ${[p.comune, p.provincia].filter(Boolean).join(' ')} · ${p.cat} — creata da mappa Pharma Pro Net (dato pubblico)`,
  }));
  let create = 0, saltate = 0;
  for (let i = 0; i < righeNuove.length; i += 100) {
    const lotto = righeNuove.slice(i, i + 100);
    try {
      const res = await sb('companies?on_conflict=name', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates, return=representation' }, body: JSON.stringify(lotto) });
      const n = Array.isArray(res) ? res.length : 0; create += n; saltate += lotto.length - n;
    } catch (e) { console.log(`${Y}lotto ${i}: ${e.message}${Z}`); saltate += lotto.length; }
  }
  console.log(`${D}nuove richieste ${righeNuove.length} · saltate (gia' esistenti) ${saltate}${Z}`);
  console.log(`${G}Arricchite ${scritte} aziende · create ${create} nuove${Z}`);
}
main().catch(e => { console.error(`${R}${e.stack || e.message}${Z}`); process.exit(1); });
