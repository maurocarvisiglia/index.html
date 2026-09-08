/**
 * PRODOTTI DA BANCA DATI/REPERTORIO DISPOSITIVI MEDICI (Ministero della Salute)
 * =============================================================================
 *   node scripts/dispositivi-medici-registro.mjs               misura, non scrive
 *   node scripts/dispositivi-medici-registro.mjs --apply       scrive
 *
 * COSTO: ZERO — open data di dati.salute.gov.it, nessuna chiamata AI.
 * Stessa logica di scripts/aifa-registro-prodotti.mjs (dato strutturato dal
 * governo, zero rischio di allucinazione), qui applicata ai dispositivi medici
 * invece che ai farmaci.
 *
 * IL FILE CAMBIA NOME OGNI SETTIMANA (aggiornamento settimanale, es.
 * "DISPO_RDM_1_20260831_csv.zip"): l'URL non va MAI hardcodato, si scopre ogni
 * volta leggendo il link dalla pagina del dataset.
 *
 * ABBINAMENTO AZIENDE — tre livelli, dal piu' al meno affidabile:
 *   0  PARTITA IVA / CODICE FISCALE esatti (nuovo rispetto allo script AIFA
 *      farmaci: qui il CSV porta anche cod_fiscale e partita IVA del
 *      fabbricante, un identificativo che non ha ambiguita' — se ~1/5 delle
 *      aziende in anagrafica ha la P.IVA compilata, per quelle il match e'
 *      certo indipendentemente da come e' scritto il nome)
 *   1  ESATTO sul nome normalizzato (come aifa-registro-prodotti.mjs)
 *   2  CONTENIMENTO DI PAROLE (stessa logica ed stessa lista CATEGORIA_GENERICA
 *      di aifa-registro-prodotti.mjs)
 *
 * A DIFFERENZA dello script farmaci: qui NON si creano aziende nuove per i
 * fabbricanti senza corrispondenza. La banca dati dispositivi medici ha
 * >2 milioni di righe e decine di migliaia di fabbricanti distinti, molti
 * dei quali irrilevanti per il recruiting Life Sciences (piccoli laboratori
 * artigianali, rivenditori di garze, ecc.) — creare un'azienda per ognuno
 * inquinerebbe l'anagrafica. Si riportano solo i fabbricanti orfani piu'
 * frequenti, per decidere caso per caso se aggiungerli a mano.
 *
 * Solo dispositivi ANCORA in commercio (data_fine_commercio vuota).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import AdmZip from 'adm-zip';
import { chiaveProdotto, scriviLotti } from './lib/dedup-conflitto.mjs';
dotenv.config();

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', D = '\x1b[2m', B = '\x1b[1m', Z = '\x1b[0m';
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

// --- stessa normalizzazione di aifa-registro-prodotti.mjs (nessuna libreria condivisa: convenzione gia' in uso nel progetto) ---
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
  // trovate con la revisione manuale completa dei 303 abbinamenti per contenimento:
  // parole troppo generiche nell'universo dei fabbricanti di dispositivi medici,
  // che hanno agganciato aziende scorrelate (es. "MENFIS BIOMEDICA" -> "BIOMEDICA
  // ITALIA" solo via "biomedica", "GLOBAL TRADE" -> "GLOBAL PHARMA" solo via "global").
  'instrument', 'instruments', 'vision', 'factory', 'biomedica', 'biomed', 'biomedical',
  'medi', 'medic', 'project', 'line', 'master', 'biologics', 'hearing', 'zero', 'bone',
  'process', 'studio', 'ingegneria', 'engineering', 'global', 'trade', 'concept',
  // seconda passata di revisione manuale: altri cluster generici trovati
  'green', 'delta', 'omega', 'phoenix', 'optima', 'evolution', 'feel', 'beyond',
  'wave', 'medicare', 'innova', 'applied', 'raffaele',
  // terza passata: token generici emersi DOPO aver tolto "chimica"/"molecular"
  // da RUMORE (che a loro volta lasciavano scoperto un secondo token altrettanto
  // generico, es. "SO.G.I.S.-INDUSTRIA CHIMICA" -> solo {industria})
  'imaging', 'industria', 'industriale',
]);

const soloCifre = (s) => (s || '').replace(/\D/g, '');

// --- scoperta dinamica dell'URL (il nome del file cambia ogni settimana) ---
async function trovaUrlZipDispositivi() {
  const paginaUrl = 'https://www.dati.salute.gov.it/it/dataset/dispositivi-medici/';
  const res = await fetch(paginaUrl);
  if (!res.ok) throw new Error(`pagina dataset dispositivi medici: HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/href="([^"]+_csv\.zip)"/i);
  if (!m) throw new Error('link al CSV non trovato nella pagina del dataset (formato pagina cambiato?)');
  return new URL(m[1], paginaUrl).href;
}

async function scaricaEdEstraiCsv(zipUrl) {
  const res = await fetch(zipUrl);
  if (!res.ok) throw new Error(`download zip dispositivi medici: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  const voce = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.csv'));
  if (!voce) throw new Error('nessun file CSV dentro lo zip dispositivi medici');
  return voce.getData();
}

// Righe di un Buffer senza convertire l'intero file (520+ MB) in una stringa
// unica: si scandisce byte per byte cercando '\n' e si decodifica solo la riga.
function* righeDiBuffer(buf) {
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      let fine = i;
      if (fine > start && buf[fine - 1] === 0x0d) fine--;
      yield buf.toString('latin1', start, fine);
      start = i + 1;
    }
  }
  if (start < buf.length) yield buf.toString('latin1', start, buf.length);
}

// Split CSV rispettando le virgolette (alcuni campi, es. denominazione
// commerciale, contengono ';' interni tra virgolette).
function splitCSV(riga, sep = ';') {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < riga.length; i++) {
    const ch = riga[i];
    if (inQ) {
      if (ch === '"') { if (riga[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// Colonne del CSV (indice -> nome), per riferimento:
// 0 tipologia_dm, 1 progressivo_dm_ass, 2 data_prima_pubblicazione,
// 3 dm_riferimento, 4 gruppo_dm_simili, 5 iscrizione_repertorio,
// 6 data_inizio_validita, 7 data_fine_validita, 8 fabbricante_assemblatore,
// 9 cod_fiscale, 10 partita_iva, 11 cod_catalogo_fabbr_ass,
// 12 denominazione_commerciale, 13 classificazione_cnd, 14 descrizione_cnd,
// 15 data_fine_commercio
const I_FABBRICANTE = 8, I_CF = 9, I_PIVA = 10, I_DENOM = 12, I_CND_COD = 13, I_CND_DESC = 14, I_FINE = 15;
const N_COLONNE_ATTESE = 16;

async function runDispositiviMediciDailyBatch(apply = CLI_APPLY) {
  const log = [];
  const push = (m) => { console.log(m); log.push(String(m).replace(/\x1b\[[0-9]+m/g, '')); };
  push(`\n${B}Repertorio Dispositivi Medici (Min. Salute) -> company_products${Z} ${D}${apply ? 'SCRIVE' : 'solo misura'} · costo 0,00 $${Z}`);

  const aziende = await sb('companies?select=id,name,iva,is_active,merged_into&limit=4000');
  const attive = aziende.filter((c) => c.is_active && !c.merged_into);

  const perNomeTutti = new Map();
  for (const c of attive) { const n = norm(c.name); if (!n) continue; if (!perNomeTutti.has(n)) perNomeTutti.set(n, []); perNomeTutti.get(n).push(c); }
  const perNome = new Map();
  for (const [n, gruppo] of perNomeTutti) if (gruppo.length === 1) perNome.set(n, gruppo[0]);

  const conToken = attive.map((c) => ({ c, tokens: tokenSet(norm(c.name)) })).filter((x) => x.tokens.size > 0);

  const perIvaTutti = new Map();
  for (const c of attive) { const cifre = soloCifre(c.iva); if (cifre.length < 8) continue; if (!perIvaTutti.has(cifre)) perIvaTutti.set(cifre, []); perIvaTutti.get(cifre).push(c); }
  const perIva = new Map();
  for (const [k, gruppo] of perIvaTutti) if (gruppo.length === 1) perIva.set(k, gruppo[0]);

  function accoppiaEsatto(nomeEstero) {
    const n = norm(nomeEstero);
    if (!n || n.length < 3) return null;
    return perNome.get(n) || null;
  }
  function accoppiaPerContenimento(nomeEstero) {
    const tokensEstero = tokenSet(norm(nomeEstero));
    if (!tokensEstero.size) return null;
    const candidati = conToken.filter(({ tokens }) => {
      // Un solo token distintivo NON basta piu', qualunque esso sia — non solo
      // quando e' in CATEGORIA_GENERICA. Scoperto l'8/09/2026 sul registro reale:
      // "Orion Pharma S.R.L." si riduce al solo token "orion" (dopo la rimozione
      // di "pharma"/"srl") e ha abbinato per contenimento "ORION SUTURES PRIVATE
      // LIMITED" (India), "ORION GT S.R.L." e "ORION TECHNOLOGIES SRL" — tre
      // fabbricanti totalmente estranei che condividono solo quella parola.
      // Stesso identico bug trovato su altre 7 aziende reali (Sun Pharma ->
      // "Sun Medical Co." Giappone, Leo Pharma -> "Leo Medical Co." Corea, CHR
      // Hansen -> "Hansen Medical Inc" USA, Lotus Pharmaceutical -> "Lotus
      // Surgicals"/"Lotus NL B.V.", Towa Pharmaceutical -> "Towa Medical
      // Instruments"/"Towa S.r.l.", piu' abbinamenti parziali su Promega e
      // Medac) — su un registro di >2 milioni di righe e decine di migliaia di
      // fabbricanti distinti, un solo token comune (anche non generico in senso
      // industriale, come un nome proprio breve) non e' mai un segnale
      // sufficientemente specifico. Richiede sempre almeno 2 token distintivi in
      // comune, che nella pratica ha sempre significato "stessa azienda" nei
      // ~300 abbinamenti per contenimento gia' rivisti a mano in questo script.
      if (tokens.size < 2) return false;
      return [...tokens].every((t) => tokensEstero.has(t));
    });
    return candidati.length === 1 ? candidati[0].c : null;
  }

  push(`${D}Aziende attive in anagrafica: ${attive.length} (${perIva.size} con P.IVA utilizzabile)${Z}`);
  push(`${D}Scopro l'URL corrente (il file cambia ogni settimana)...${Z}`);
  const zipUrl = await trovaUrlZipDispositivi();
  push(`${D}  ${zipUrl}${Z}`);
  push(`${D}Scarico ed estraggo il CSV (circa 500 MB da decompresso, puo' richiedere qualche minuto)...${Z}`);
  const csvBuf = await scaricaEdEstraiCsv(zipUrl);
  push(`${D}  estratto: ${(csvBuf.length / 1e6).toFixed(0)} MB${Z}`);

  const trovati = new Map(); // company_id|nome_prodotto_lower -> riga company_products
  const aziendeMatchate = new Set();
  const aziendeMatchatePerIva = new Set();
  const matchPerContenimento = [];
  const cacheNome = new Map(); // fabbricante grezzo -> azienda|null (evita di rifare il contenimento per ogni riga)
  const orfani = new Map(); // nome fabbricante normalizzato -> {rappresentativo, conteggio}

  let righeLette = 0, righeAttive = 0, righeMalformate = 0, prima = true;
  for (const riga of righeDiBuffer(csvBuf)) {
    if (prima) { prima = false; continue; }
    if (!riga.trim()) continue;
    righeLette++;
    if (righeLette % 500000 === 0) push(`${D}  ... ${righeLette} righe lette${Z}`);

    const campi = splitCSV(riga);
    if (campi.length < N_COLONNE_ATTESE) { righeMalformate++; continue; }

    const fineCommercio = (campi[I_FINE] || '').trim();
    if (fineCommercio) continue; // non piu' in commercio
    righeAttive++;

    const fabbricante = (campi[I_FABBRICANTE] || '').trim();
    const nomeProdotto = (campi[I_DENOM] || '').trim();
    if (!fabbricante || !nomeProdotto) continue;

    let azienda = null;
    let viaPiva = false;
    const cifrePiva = soloCifre(campi[I_PIVA]);
    const cifreCf = soloCifre(campi[I_CF]);
    if (cifrePiva && perIva.has(cifrePiva)) { azienda = perIva.get(cifrePiva); viaPiva = true; }
    else if (cifreCf && perIva.has(cifreCf)) { azienda = perIva.get(cifreCf); viaPiva = true; }
    else if (cacheNome.has(fabbricante)) azienda = cacheNome.get(fabbricante);
    else {
      azienda = accoppiaEsatto(fabbricante);
      let viaContenimento = false;
      if (!azienda) { azienda = accoppiaPerContenimento(fabbricante); viaContenimento = !!azienda; }
      cacheNome.set(fabbricante, azienda);
      if (azienda && viaContenimento) matchPerContenimento.push({ fabbricante, azienda: azienda.name });
    }

    if (!azienda) {
      const chiaveNorm = norm(fabbricante);
      if (chiaveNorm) {
        if (!orfani.has(chiaveNorm)) orfani.set(chiaveNorm, { rappresentativo: fabbricante, conteggio: 0 });
        orfani.get(chiaveNorm).conteggio++;
      }
      continue;
    }

    aziendeMatchate.add(azienda.id);
    if (viaPiva) aziendeMatchatePerIva.add(azienda.id);
    const cnd = (campi[I_CND_DESC] || campi[I_CND_COD] || '').trim();
    const chiave = azienda.id + '|' + nomeProdotto.toLowerCase();
    if (!trovati.has(chiave)) {
      trovati.set(chiave, {
        company_id: azienda.id,
        brand_name: nomeProdotto.slice(0, 300),
        active_ingredients: null,
        // Colonna dedicata (db/PARTE_20), non solo testo dentro source_proof:
        // e' quello che permette di trovare "aziende con lo stesso tipo di
        // dispositivo" (usato da trovaConcorrenti() in index.html), lo
        // stesso ruolo che active_ingredients_norm ha per i farmaci.
        device_category: cnd || null,
        category: 'commercializzato',
        fonte: 'registro_pubblico',
        source_proof: `Repertorio Dispositivi Medici (Min. Salute) — Fabbricante/Assemblatore: ${fabbricante}${viaPiva ? ' (abbinato per P.IVA)' : ''}${cnd ? ' — ' + cnd : ''}`.slice(0, 400),
        source_url: 'https://www.dati.salute.gov.it/it/dataset/dispositivi-medici/',
      });
    }
  }

  push(`\n${'─'.repeat(80)}`);
  push(`  righe lette ........................... ${righeLette}${righeMalformate ? ` ${R}(${righeMalformate} malformate, scartate)${Z}` : ''}`);
  push(`  di cui ancora in commercio ............ ${righeAttive}`);
  push(`  ${G}aziende collegate ..................... ${aziendeMatchate.size}${Z} ${D}(di cui ${aziendeMatchatePerIva.size} per P.IVA esatta, ${new Set(matchPerContenimento.map((m) => m.azienda)).size} per nome simile)${Z}`);
  push(`  ${Y}fabbricanti senza azienda corrispondente ${orfani.size}${Z} ${D}(NON creati automaticamente, vedi sopra nel file)${Z}`);
  push(`  ${G}prodotti distinti (aziende esistenti) . ${trovati.size}${Z}`);

  if (matchPerContenimento.length) {
    push(`\n  ${D}Esempi di abbinamento per nome simile:${Z}`);
    const visti = new Set();
    for (const m of matchPerContenimento) {
      const k = m.fabbricante + '|' + m.azienda;
      if (visti.has(k)) continue;
      visti.add(k);
      push(`    "${m.fabbricante}" -> "${m.azienda}"`);
    }
  }

  if (orfani.size) {
    push(`\n  ${D}Fabbricanti orfani piu' frequenti (candidati per aggiunta manuale):${Z}`);
    const top = [...orfani.values()].sort((a, b) => b.conteggio - a.conteggio).slice(0, 15);
    for (const o of top) push(`    ${o.rappresentativo} ${D}(${o.conteggio} dispositivi)${Z}`);
  }

  const daScrivere = [...trovati.values()];
  const summary = {
    righeLette, righeAttive, aziendeCollegate: aziendeMatchate.size, aziendeCollegatePerIva: aziendeMatchatePerIva.size,
    fabbricantiOrfani: orfani.size, prodottiTrovati: daScrivere.length, prodottiScritti: 0,
  };

  if (!apply) {
    push(`\n  ${Y}misura soltanto: nulla scritto. Rilancia con --apply.${Z}\n`);
    return { summary, log };
  }

  const logLotti = (m) => push(`${D}  ${m}${Z}`);

  // Stesso bug/fix di aifa-registro-prodotti.mjs: l'indice unico di
  // company_products e' su un'ESPRESSIONE (company_id, lower(brand_name)), non
  // su colonne — PostgREST non accetta on_conflict=<indice> in quel caso.
  // Si scarta a monte cio' che esiste gia' e si scrive con un INSERT semplice.
  async function prodottiEsistentiPerAziende(ids) {
    const set = new Set();
    for (let i = 0; i < ids.length; i += 50) {
      const lotto = ids.slice(i, i + 50);
      const righe = await sb(`company_products?select=company_id,brand_name&company_id=in.(${lotto.join(',')})`);
      for (const r of righe) set.add(chiaveProdotto(r));
    }
    return set;
  }

  const idAziendeCoinvolte = [...aziendeMatchate];
  const chiaviGiaScritte = await prodottiEsistentiPerAziende(idAziendeCoinvolte);
  const daScrivereNuovi = daScrivere.filter((r) => !chiaviGiaScritte.has(chiaveProdotto(r)));
  const giaPresenti = daScrivere.length - daScrivereNuovi.length;
  if (giaPresenti) push(`${D}  ${giaPresenti} prodotti gia' presenti in company_products, saltati${Z}`);

  const nP = await scriviLotti(sb, 'company_products', daScrivereNuovi, chiaveProdotto, logLotti);
  summary.prodottiScritti = nP;
  push(`\n  ${G}scritti ${nP} prodotti${Z}\n`);
  return { summary, log };
}

export { runDispositiviMediciDailyBatch };

const isCLI = process.argv[1] && process.argv[1].includes('dispositivi-medici-registro.mjs');
if (isCLI) {
  runDispositiviMediciDailyBatch().catch((e) => {
    console.error('❌ ERRORE TOP-LEVEL:', e.message);
    process.exit(1);
  });
}
