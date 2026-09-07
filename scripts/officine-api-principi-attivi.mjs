/**
 * OFFICINE AUTORIZZATE AIFA · PRODUZIONE PRINCIPI ATTIVI (API)
 * =============================================================================
 *   node scripts/officine-api-principi-attivi.mjs               misura, non scrive
 *   node scripts/officine-api-principi-attivi.mjs --apply       scrive
 *
 * COSTO: ZERO — CSV pubblico da aifa.gov.it, nessuna chiamata AI.
 *
 * Scrive un FATTO aziendale (company_facts, tipo='certificazione_gmp'), non
 * un prodotto: l'elenco AIFA dice che un'azienda ha un sito autorizzato alla
 * produzione/importazione di principi attivi farmacologici, non quali
 * farmaci vende — e' un'informazione sul tipo di attivita' dell'azienda
 * (rilevante per il recruiting: officine GMP hanno profili produzione/
 * qualita' diversi da chi vende solo farmaci finiti), non un company_products.
 *
 * REQUISITO DB: company_facts.tipo deve ammettere 'certificazione_gmp' e
 * company_facts.fonte deve ammettere 'registro_pubblico' — vedi
 * db/PARTE_14_company_facts_tipo_certificazione_gmp.sql e
 * db/PARTE_15_company_facts_fonte_registro_pubblico.sql (gia' applicate).
 *
 * L'URL del CSV cambia ad ogni aggiornamento (nome file con la data, es.
 * "OFFICINE_API_GIUGNO_2025.csv"): si scopre leggendo il link dalla pagina,
 * mai fissato a mano.
 *
 * ABBINAMENTO AZIENDE — stessa logica conservativa di aifa-registro-prodotti.mjs
 * e dispositivi-medici-registro.mjs (nessuna libreria condivisa: convenzione
 * gia' in uso nel progetto). Dataset piccolo (~290 officine): niente creazione
 * di aziende nuove, si riportano solo gli orfani per un'eventuale aggiunta manuale.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { chiaveFatto, scriviLotti } from './lib/dedup-conflitto.mjs';
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
]);

// --- scoperta dinamica dell'URL (il file cambia ad ogni aggiornamento periodico) ---
async function trovaUrlOfficineApi() {
  const paginaUrl = 'https://www.aifa.gov.it/web/guest/officine-autorizzate';
  const res = await fetch(paginaUrl);
  if (!res.ok) throw new Error(`pagina officine autorizzate: HTTP ${res.status}`);
  const html = await res.text();
  const ancora = html.toLowerCase().indexOf('materie prime farmacologicamente attive');
  if (ancora === -1) throw new Error('testo di ancoraggio "materie prime farmacologicamente attive" non trovato (pagina cambiata?)');
  const finestra = html.slice(ancora, ancora + 3000);
  const m = finestra.match(/href="([^"]+\.csv)"/i);
  if (!m) throw new Error('link al CSV non trovato vicino al testo di ancoraggio');
  return new URL(m[1], paginaUrl).href;
}

function parseCSVSemplice(testo) {
  // Formato verificato: nessun campo contiene ';' o '"', un semplice split basta.
  const righe = testo.split(/\r?\n/).map((r) => r.split(';'));
  return righe
    .slice(2) // riga 1: titolo, riga 2: intestazione "Denominazione;Indirizzo;"
    .map(([denominazione, indirizzo]) => ({ denominazione: (denominazione || '').trim(), indirizzo: (indirizzo || '').trim() }))
    .filter((r) => r.denominazione);
}

async function runOfficineApiDailyBatch(apply = CLI_APPLY) {
  const log = [];
  const push = (m) => { console.log(m); log.push(String(m).replace(/\x1b\[[0-9]+m/g, '')); };
  push(`\n${B}Officine AIFA principi attivi (API) -> company_facts${Z} ${D}${apply ? 'SCRIVE' : 'solo misura'} · costo 0,00 $${Z}`);

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

  push(`${D}Scopro l'URL corrente...${Z}`);
  const url = await trovaUrlOfficineApi();
  push(`${D}  ${url}${Z}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download CSV officine API: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const testo = Buffer.from(buf).toString('latin1'); // Windows-1252/Latin1, come gli altri CSV AIFA
  const righe = parseCSVSemplice(testo);
  push(`${D}  ${righe.length} officine elencate${Z}`);

  const trovati = new Map(); // company_id -> riga company_facts (una sola per azienda: puo' avere piu' officine)
  const officinePerAzienda = new Map(); // company_id -> [indirizzi]
  const aziendeMatchate = new Set();
  const matchPerContenimento = [];
  const orfani = new Map(); // nome normalizzato -> {rappresentativo, conteggio}

  for (const r of righe) {
    let azienda = accoppiaEsatto(r.denominazione);
    let viaContenimento = false;
    if (!azienda) { azienda = accoppiaPerContenimento(r.denominazione); viaContenimento = !!azienda; }

    if (!azienda) {
      const chiaveNorm = norm(r.denominazione);
      if (chiaveNorm) {
        if (!orfani.has(chiaveNorm)) orfani.set(chiaveNorm, { rappresentativo: r.denominazione, conteggio: 0 });
        orfani.get(chiaveNorm).conteggio++;
      }
      continue;
    }

    if (viaContenimento) matchPerContenimento.push({ denominazione: r.denominazione, azienda: azienda.name });
    aziendeMatchate.add(azienda.id);
    if (!officinePerAzienda.has(azienda.id)) officinePerAzienda.set(azienda.id, []);
    officinePerAzienda.get(azienda.id).push(r.indirizzo);
  }

  for (const [companyId, indirizzi] of officinePerAzienda) {
    const valore = indirizzi.length > 1
      ? `Officina autorizzata AIFA alla produzione/importazione di principi attivi (${indirizzi.length} siti)`
      : 'Officina autorizzata AIFA alla produzione/importazione di principi attivi';
    trovati.set(companyId, {
      company_id: companyId, tipo: 'certificazione_gmp', valore,
      fonte: 'registro_pubblico',
      prova: indirizzi.slice(0, 5).join(' — ').slice(0, 400),
      url: 'https://www.aifa.gov.it/web/guest/officine-autorizzate',
    });
  }

  push(`\n${'─'.repeat(80)}`);
  push(`  officine lette ......................... ${righe.length}`);
  push(`  ${G}aziende collegate ....................... ${aziendeMatchate.size}${Z} ${D}(di cui ${new Set(matchPerContenimento.map((m) => m.azienda)).size} per nome simile, non esatto)${Z}`);
  push(`  ${Y}denominazioni senza azienda corrispondente ${orfani.size}${Z} ${D}(NON create automaticamente)${Z}`);

  if (matchPerContenimento.length) {
    push(`\n  ${D}Esempi di abbinamento per nome simile:${Z}`);
    for (const m of matchPerContenimento.slice(0, 20)) push(`    "${m.denominazione}" -> "${m.azienda}"`);
  }
  if (orfani.size) {
    push(`\n  ${D}Denominazioni orfane:${Z}`);
    for (const o of [...orfani.values()].slice(0, 20)) push(`    ${o.rappresentativo}`);
  }

  const daScrivere = [...trovati.values()];
  const summary = { officineLette: righe.length, aziendeCollegate: aziendeMatchate.size, aziendeOrfane: orfani.size, fattiScritti: 0 };

  if (!apply) {
    push(`\n  ${Y}misura soltanto: nulla scritto. Rilancia con --apply.${Z}\n`);
    return { summary, log };
  }

  const logLotti = (m) => push(`${D}  ${m}${Z}`);

  // Stesso principio di cautela usato per company_products: si scarta a monte
  // cio' che esiste gia' (stessa azienda + stesso tipo) e si scrive con un
  // INSERT semplice, senza affidarsi a on_conflict su un indice che non ho
  // verificato riga per riga.
  const idAziende = [...aziendeMatchate];
  const esistenti = new Set();
  for (let i = 0; i < idAziende.length; i += 50) {
    const lotto = idAziende.slice(i, i + 50);
    const righeEsistenti = await sb(`company_facts?select=company_id,tipo,valore&company_id=in.(${lotto.join(',')})&tipo=eq.certificazione_gmp`);
    for (const r of righeEsistenti) esistenti.add(chiaveFatto(r));
  }
  const daScrivereNuovi = daScrivere.filter((r) => !esistenti.has(chiaveFatto(r)));
  const giaPresenti = daScrivere.length - daScrivereNuovi.length;
  if (giaPresenti) push(`${D}  ${giaPresenti} fatti gia' presenti, saltati${Z}`);

  const nF = await scriviLotti(sb, 'company_facts', daScrivereNuovi, chiaveFatto, logLotti);
  summary.fattiScritti = nF;
  push(`\n  ${G}scritti ${nF} fatti (certificazione_gmp)${Z}\n`);
  return { summary, log };
}

export { runOfficineApiDailyBatch };

const isCLI = process.argv[1] && process.argv[1].includes('officine-api-principi-attivi.mjs');
if (isCLI) {
  runOfficineApiDailyBatch().catch((e) => {
    console.error('❌ ERRORE TOP-LEVEL:', e.message);
    process.exit(1);
  });
}
