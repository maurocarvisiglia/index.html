/**
 * PRINCIPI ATTIVI · Certificati di Idoneità EDQM (CEP) — produttori italiani
 * =============================================================================
 *   node scripts/principi-attivi-edqm.mjs               misura, non scrive
 *   node scripts/principi-attivi-edqm.mjs --apply       scrive
 *
 * COSTO: ZERO — file bulk pubblico di EDQM (European Directorate for the
 * Quality of Medicines), nessuna chiamata AI.
 *
 * A differenza di officine-api-principi-attivi.mjs (elenco AIFA delle
 * officine autorizzate — dice SOLO "questa azienda ha un sito GMP", non COSA
 * produce), qui ogni riga del registro EDQM collega un principio attivo
 * SPECIFICO al produttore che ne detiene il Certificato di Idoneità (CEP) —
 * la prova regolatoria che quell'azienda fabbrica davvero quella sostanza.
 * Fonte diversa, dato piu' granulare, stesso spirito: registro governativo/
 * regolatorio strutturato, zero rischio di allucinazione.
 *
 * REQUISITO DB: company_products.category deve ammettere 'principio_attivo'
 * — vedi db/PARTE_19_company_products_category_principio_attivo.sql (gia'
 * applicata).
 *
 * FORMATO DEL FILE: esportazione bulk giornaliera di EDQM (aggiornata fra
 * mezzogiorno e le 13 CET), TSV con BOM UTF-8. Il campo "holder" non separa
 * nome azienda e citta' con un carattere dedicato (es. "ICE S.P.A. Basaluzzo,
 * Alessandria IT") — si individua il confine cercando l'ULTIMA forma
 * societaria nel testo e tagliando li'.
 *
 * ABBINAMENTO AZIENDE — stessa logica conservativa degli altri registri
 * pubblici di questa sessione (nessuna libreria condivisa: convenzione gia'
 * in uso). Dataset piccolo e di alta qualita' (~500 certificati validi
 * italiani): niente creazione di aziende nuove, si riportano solo gli
 * orfani per un'eventuale aggiunta manuale.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { chiaveProdotto, scriviLotti } from './lib/dedup-conflitto.mjs';
import { costruisciLookupAtc, normalizzaPrincipioAttivo } from './lib/atc-lookup.mjs';
dotenv.config();

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const G = '\x1b[32m', Y = '\x1b[33m', D = '\x1b[2m', B = '\x1b[1m', Z = '\x1b[0m';
const CLI_APPLY = process.argv.includes('--apply');

const envFile = (n) => (readFileSync(join(ROOT, '.env'), 'utf8').match(new RegExp('^\\s*' + n + '=(.*)$', 'm')) || [])[1]?.trim();
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || envFile('SUPABASE_SERVICE_ROLE_KEY');
const SB = (process.env.SUPABASE_URL || envFile('SUPABASE_URL') || '').replace(/\/+$/, '') + '/rest/v1';

async function sb(path, init = {}) {
  const r = await fetch(`${SB}/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

const FORME_SPAZIATE = /\b(s r l|s p a|s a s|s n c|b v|n v|a g|s a|l l c)\b/g;
const RUMORE = /\b(spa|srl|sas|snc|societa|italia|italy|group|holding|inc|ltd|limited|llc|gmbh|bvba|plc|co|corp|corporation|company|pharmaceuticals?|pharma|therapeutics?|biosciences?|biotech|biotec|sciences?|labs?|laboratories|and|the|nederland|deutschland|france|espana|europe|medical|meditech|healthcare|ireland|republic|uk|usa|canada|china|korea|japan|switzerland|sweden|norway|finland|poland|belgium|austria|netherlands|spain|portugal|brazil|mexico|india|singapore|australia|denmark|nordic|chimica|chimico|farmaceutica|farmaceutico|molecular|linea|partners)\b/g;

const norm = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(FORME_SPAZIATE, ' ')
  .replace(RUMORE, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function tokenSet(nomeNorm) {
  return new Set(nomeNorm.split(' ').filter((t) => t.length >= 4));
}

const CATEGORIA_GENERICA = new Set([
  'pharm', 'pharma', 'pharmac', 'farma', 'farmaceutici', 'research', 'solutions', 'soluzioni',
  'international', 'life', 'health', 'medical', 'care', 'laboratoires', 'laboratoire', 'laboratori',
  'diagnostics', 'service', 'services', 'euro', 'med', 'industrie', 'industries',
  'device', 'devices', 'surgical', 'system', 'systems', 'group', 'gruppo', 'technology', 'technologies',
  'instrument', 'instruments', 'vision', 'factory', 'biomedica', 'biomed', 'biomedical',
  'medi', 'medic', 'project', 'line', 'master', 'biologics', 'hearing', 'zero', 'bone',
  'process', 'studio', 'ingegneria', 'engineering', 'global', 'trade', 'concept',
  'green', 'delta', 'omega', 'phoenix', 'optima', 'evolution', 'feel', 'beyond',
  'wave', 'medicare', 'innova', 'applied', 'raffaele', 'imaging', 'industria', 'industriale',
  'chimica', 'industriale',
]);

// Forme societarie italiane (qui il file e' gia' filtrato ai soli titolari
// IT): usate per trovare il confine fra nome azienda e citta'. Il lookahead
// negativo "nessuna lettera dopo" evita che "S.p.A." o "Sa" combacino come
// prefisso di una citta' che inizia allo stesso modo (es. "Sacile",
// "Sassuolo" venivano tagliati come se contenessero la forma societaria
// "Sa" — bug reale trovato il 07/09/2026 su "MINERARIA SACILESE").
const FORMA_SOCIETARIA = /\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|s\.?c\.?a\.?r\.?l\.?|societa cooperativa)(?![a-zA-Z])/gi;

// Il campo "Substance" di EDQM a volte include in coda i codici prodotto
// interni del certificato ("Levothyroxine sodium hydrate, Product code 083508
// and product code 083510") — non fanno parte del nome della sostanza, si
// tagliano. Trovato il 07/09/2026 su 5 righe già importate (ripulite a mano),
// qui si evita che si riformino ad ogni rilancio dello script.
function pulisciSostanza(s) {
  return (s || '').replace(/,?\s*Product codes?:?.*/i, '').trim();
}

// "ICE S.P.A. Basaluzzo, Alessandria IT" -> {nome: "ICE S.P.A.", luogo: "Basaluzzo, Alessandria"}
// Cerca l'ULTIMA forma societaria nel testo (prima della citta') e taglia li'.
function separaNomeELuogo(holderConPaese) {
  const senzaPaese = holderConPaese.replace(/\s+[A-Z]{2}$/, '').trim();
  const forme = [...senzaPaese.matchAll(FORMA_SOCIETARIA)];
  if (!forme.length) return { nome: senzaPaese, luogo: '' };
  const ultima = forme[forme.length - 1];
  const fine = ultima.index + ultima[0].length;
  return { nome: senzaPaese.slice(0, fine).trim(), luogo: senzaPaese.slice(fine).trim() };
}

async function scaricaCsvEdqm() {
  const url = 'https://extranet.edqm.eu/4DLink1/4DCGI/EXPORT_WEB_CEP.txt';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download CEP EDQM: HTTP ${res.status}`);
  let testo = await res.text();
  testo = testo.replace(/^﻿/, '');
  const righe = testo.split(/\r?\n/).filter(Boolean).map((r) => r.split('\t'));
  const header = righe[0];
  return righe.slice(1).map((cols) => {
    const obj = {};
    header.forEach((h, i) => { obj[h.trim()] = cols[i]; });
    return obj;
  });
}

async function runPrincipiAttiviEdqmDailyBatch(apply = CLI_APPLY) {
  const log = [];
  const push = (m) => { console.log(m); log.push(String(m).replace(/\x1b\[[0-9]+m/g, '')); };
  push(`\n${B}Principi attivi EDQM (CEP) -> company_products${Z} ${D}${apply ? 'SCRIVE' : 'solo misura'} · costo 0,00 $${Z}`);

  // db/PARTE_23: stesso lookup usato da aifa-registro-prodotti.mjs (file
  // Equivalenti, non scaricato qui altrimenti — costo 0,00 $ anche questo).
  push(`${D}Costruisco il lookup principio attivo -> ATC dal file Equivalenti AIFA...${Z}`);
  const lookupAtc = await costruisciLookupAtc().catch((e) => { push(`${Y}  lookup ATC non disponibile: ${e.message} — proseguo senza${Z}`); return new Map(); });
  push(`${D}  ${lookupAtc.size} principi attivi con ATC noto${Z}`);

  const aziende = await sb('companies?select=id,name,is_active,merged_into&limit=4000');
  const attive = aziende.filter((c) => c.is_active && !c.merged_into);

  const perNomeTutti = new Map();
  for (const c of attive) { const n = norm(c.name); if (!n) continue; if (!perNomeTutti.has(n)) perNomeTutti.set(n, []); perNomeTutti.get(n).push(c); }
  const perNome = new Map();
  for (const [n, gruppo] of perNomeTutti) if (gruppo.length === 1) perNome.set(n, gruppo[0]);
  const conToken = attive.map((c) => ({ c, tokens: tokenSet(norm(c.name)) })).filter((x) => x.tokens.size > 0);

  function accoppiaEsatto(nomeEstero) {
    const n = norm(nomeEstero);
    if (!n || n.length < 3) return null;
    return perNome.get(n) || null;
  }
  function accoppiaPerContenimento(nomeEstero) {
    const tokensEstero = tokenSet(norm(nomeEstero));
    if (!tokensEstero.size) return null;
    const candidati = conToken.filter(({ tokens }) => {
      if (tokens.size === 1 && CATEGORIA_GENERICA.has([...tokens][0])) return false;
      return [...tokens].every((t) => tokensEstero.has(t));
    });
    return candidati.length === 1 ? candidati[0].c : null;
  }

  push(`${D}Scarico il registro EDQM (aggiornamento bulk giornaliero)...${Z}`);
  const righe = await scaricaCsvEdqm();
  push(`${D}  ${righe.length} certificati totali (tutti i paesi, tutti gli stati)${Z}`);

  const italianeValide = righe.filter((r) => (r['Certificate (CEP) Holder'] || '').trim().endsWith(' IT') && r['Status CEP'] === 'Valid');
  push(`${D}  ${italianeValide.length} con titolare italiano e stato "Valid"${Z}`);

  const trovati = new Map(); // company_id|principio_attivo_lower -> riga company_products
  const aziendeMatchate = new Set();
  const matchPerContenimento = [];
  const orfani = new Map(); // nome normalizzato -> {rappresentativo, conteggio}

  for (const r of italianeValide) {
    const { nome: nomeAzienda, luogo } = separaNomeELuogo(r['Certificate (CEP) Holder']);
    const sostanza = pulisciSostanza(r['Substance']);
    if (!nomeAzienda || !sostanza) continue;

    let azienda = accoppiaEsatto(nomeAzienda);
    let viaContenimento = false;
    if (!azienda) { azienda = accoppiaPerContenimento(nomeAzienda); viaContenimento = !!azienda; }

    if (!azienda) {
      const chiaveNorm = norm(nomeAzienda);
      if (chiaveNorm) {
        if (!orfani.has(chiaveNorm)) orfani.set(chiaveNorm, { rappresentativo: nomeAzienda, conteggio: 0 });
        orfani.get(chiaveNorm).conteggio++;
      }
      continue;
    }

    if (viaContenimento) matchPerContenimento.push({ nomeAzienda, azienda: azienda.name });
    aziendeMatchate.add(azienda.id);
    const chiave = azienda.id + '|' + sostanza.toLowerCase();
    if (!trovati.has(chiave)) {
      trovati.set(chiave, {
        company_id: azienda.id,
        brand_name: sostanza.slice(0, 300),
        active_ingredients: [sostanza],
        category: 'principio_attivo',
        // db/PARTE_23: l'ATC classifica la sostanza chimica, non il canale di
        // vendita — lo stesso lookup usato per i farmaci finiti (costruito
        // dal file AIFA Equivalenti) si applica anche qui, verificato il
        // 08/09/2026 su Furosemide (F.I.S.) -> C03CA01, identico al farmaco finito.
        atc_code: lookupAtc.get(normalizzaPrincipioAttivo(sostanza)) || null,
        fonte: 'registro_pubblico',
        source_proof: `EDQM — Certificato di Idoneità (CEP) ${r['Certificate (CEP) Number'] || ''} — Titolare: ${r['Certificate (CEP) Holder']}${luogo ? ' (' + luogo + ')' : ''}`.slice(0, 400),
        source_url: 'https://extranet.edqm.eu/publications/recherches_CEP.shtml',
      });
    }
  }

  push(`\n${'─'.repeat(80)}`);
  push(`  certificati italiani validi letti .......... ${italianeValide.length}`);
  push(`  ${G}aziende collegate ........................... ${aziendeMatchate.size}${Z} ${D}(di cui ${new Set(matchPerContenimento.map((m) => m.azienda)).size} per nome simile, non esatto)${Z}`);
  push(`  ${Y}titolari senza azienda corrispondente ....... ${orfani.size}${Z} ${D}(NON creati automaticamente)${Z}`);
  push(`  ${G}principi attivi distinti (aziende esistenti)  ${trovati.size}${Z}`);

  if (matchPerContenimento.length) {
    push(`\n  ${D}Esempi di abbinamento per nome simile:${Z}`);
    const visti = new Set();
    for (const m of matchPerContenimento) {
      const k = m.nomeAzienda + '|' + m.azienda;
      if (visti.has(k)) continue;
      visti.add(k);
      if (visti.size > 20) break;
      push(`    "${m.nomeAzienda}" -> "${m.azienda}"`);
    }
  }
  if (orfani.size) {
    push(`\n  ${D}Titolari orfani più frequenti:${Z}`);
    const top = [...orfani.values()].sort((a, b) => b.conteggio - a.conteggio).slice(0, 20);
    for (const o of top) push(`    ${o.rappresentativo} ${D}(${o.conteggio} certificati)${Z}`);
  }

  const daScrivere = [...trovati.values()];
  const summary = { certificatiLetti: italianeValide.length, aziendeCollegate: aziendeMatchate.size, aziendeOrfane: orfani.size, principiAttiviTrovati: daScrivere.length, principiAttiviScritti: 0 };

  if (!apply) {
    push(`\n  ${Y}misura soltanto: nulla scritto. Rilancia con --apply.${Z}\n`);
    return { summary, log };
  }

  const logLotti = (m) => push(`${D}  ${m}${Z}`);

  // Stesso principio di cautela degli altri script: si scarta a monte cio' che
  // esiste gia' e si scrive con un INSERT semplice, senza on_conflict su un
  // indice a espressione (bug reale, vedi aifa-registro-prodotti.mjs).
  const idAziende = [...aziendeMatchate];
  const chiaviGiaScritte = new Set();
  for (let i = 0; i < idAziende.length; i += 50) {
    const lotto = idAziende.slice(i, i + 50);
    const righeEsistenti = await sb(`company_products?select=company_id,brand_name&company_id=in.(${lotto.join(',')})`);
    for (const r of righeEsistenti) chiaviGiaScritte.add(chiaveProdotto(r));
  }
  const daScrivereNuovi = daScrivere.filter((r) => !chiaviGiaScritte.has(chiaveProdotto(r)));
  const giaPresenti = daScrivere.length - daScrivereNuovi.length;
  if (giaPresenti) push(`${D}  ${giaPresenti} principi attivi già presenti, saltati${Z}`);

  const nP = await scriviLotti(sb, 'company_products', daScrivereNuovi, chiaveProdotto, logLotti);
  summary.principiAttiviScritti = nP;
  push(`\n  ${G}scritti ${nP} principi attivi${Z}\n`);
  return { summary, log };
}

export { runPrincipiAttiviEdqmDailyBatch };

const isCLI = process.argv[1] && process.argv[1].includes('principi-attivi-edqm.mjs');
if (isCLI) {
  runPrincipiAttiviEdqmDailyBatch().catch((e) => {
    console.error('❌ ERRORE TOP-LEVEL:', e.message);
    process.exit(1);
  });
}
