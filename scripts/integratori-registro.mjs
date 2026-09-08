/**
 * PRODOTTI DA REGISTRO INTEGRATORI ALIMENTARI NOTIFICATI (Ministero della Salute)
 * =============================================================================
 *   node scripts/integratori-registro.mjs               misura, non scrive
 *   node scripts/integratori-registro.mjs --apply       scrive
 *
 * COSTO: ZERO — open data di salute.gov.it, nessuna chiamata AI. Stessa logica
 * di scripts/aifa-registro-prodotti.mjs e scripts/dispositivi-medici-registro.mjs
 * (dato strutturato dal governo, zero rischio di allucinazione), qui applicata
 * agli integratori alimentari invece che a farmaci/dispositivi.
 *
 * FONTE: "Elenco in ordine alfabetico per impresa" degli integratori notificati,
 * pagina https://www.salute.gov.it/new/it/tema/alimenti-fini-medici-speciali-ed-integratori/registro-degli-integratori-alimentari
 * — un PDF (non CSV: il Ministero non pubblica gli integratori in formato
 * strutturato), ~110.000 prodotti notificati, aggiornato mensilmente. IL FILE
 * CAMBIA NOME OGNI AGGIORNAMENTO (es. INTEGRATORI_NOTIFICATI_ORD_AZ_12.pdf,
 * dentro una cartella /2026-08/ che cambia anch'essa): l'URL non va MAI
 * hardcodato, si scopre ogni volta leggendo il link dalla pagina del registro.
 *
 * PARSING PDF — il testo estratto (pdf-parse) non ha colonne a larghezza fissa
 * affidabile (le posizioni cambiano pagina per pagina, verificato: 300+
 * offset distinti su 4060 pagine con pdftotext -layout, scartato per questo).
 * Si sfrutta invece un pattern osservato nei dati reali: il nome IMPRESA si
 * RIPETE per intero su ogni riga prodotto quando non va a capo (es. "+ WATT
 * S.R.L. ACETIL L-CARNITINA+ 149054" poi "+ WATT S.R.L. ACTIVATOR RECOVERY
 * MIX 207047" — impresa letteralmente ripetuta). Algoritmo:
 *   1  accumula righe in un buffer fino a incontrare una riga che termina con
 *      un numero (CODICE = fine di una voce)
 *   2  se il testo del buffer inizia con l'IMPRESA della voce precedente
 *      (stessa azienda, caso comune), la si riusa e il resto e' il prodotto
 *   3  altrimenti (prima voce di una nuova azienda) si cerca la prima forma
 *      legale (S.P.A./S.R.L./SNC/SAS/...) tra le prime 8 parole e si taglia
 *      li' — funziona bene per le S.p.A./S.r.l. (quello che ci interessa: i
 *      titolari individuali senza forma legale chiara restano imprecisi, ma
 *      sono comunque esclusi dal filtro di creazione azienda sotto)
 * Non e' un parsing perfetto (titolari individuali con nomi lunghi possono
 * garbugliarsi), ma e' quello che serve per l'uso reale: abbinare aziende
 * gia' in anagrafica o creare nuove S.p.A./S.r.l. con un catalogo vero.
 *
 * ABBINAMENTO AZIENDE — due livelli (nessuna P.IVA nel registro, a differenza
 * di quello dispositivi medici):
 *   1  ESATTO sul nome normalizzato
 *   2  CONTENIMENTO — richiede SEMPRE almeno 2 token distintivi in comune
 *      (mai un solo token, generico o no: e' il bug reale trovato e corretto
 *      l'8/09/2026 su Orion Pharma/Sun Pharma/Leo Pharma/CHR Hansen/Lotus
 *      Pharmaceutical/Towa Pharmaceutical — un solo nome comune abbinava
 *      fabbricanti esteri completamente estranei)
 *
 * CREAZIONE AZIENDE NUOVE — a differenza dello script dispositivi (che non ne
 * crea mai): qui SI', ma solo per chi ha una forma societaria vera
 * (S.p.A./S.r.l. nel nome, non titolare individuale/ditta/erboristeria) E
 * almeno 10 prodotti notificati (soglia concordata con Mauro l'8/09/2026come
 * proxy di "azienda realmente operativa" — il registro non ha ne' P.IVA ne'
 * fatturato, la soglia sul numero di prodotti e' l'unico segnale gratuito
 * disponibile in blocco). Diagnosi misurata sui dati reali: 944 aziende,
 * 42.944 prodotti a questa soglia.
 *
 * "PRODOTTO NOTIFICATO" NON VUOL DIRE "IN COMMERCIO OGGI": il registro prova
 * solo che l'azienda ha notificato il prodotto, mai quando ne' se e' ancora
 * venduto (stesso limite che ha gia' AIFA per i farmaci). Questo script scrive
 * la base dati ufficiale; un secondo script dedicato (stesso schema di
 * scripts/core-prodotti-cosmetici-giornaliero.mjs) verifichera' via CORE quali
 * prodotti sono davvero ancora sul sito ufficiale dell'azienda, aggiungendo
 * anche categoria_prodotto/canale_distributivo — due fasi separate, non una.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PDFParse } from 'pdf-parse';
import { chiaveProdotto, scriviLotti } from './lib/dedup-conflitto.mjs';
dotenv.config();

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', D = '\x1b[2m', B = '\x1b[1m', Z = '\x1b[0m';
const CLI_APPLY = process.argv.includes('--apply');
const SOGLIA_PRODOTTI_NUOVA_AZIENDA = 10;

const envFile = (n) => (readFileSync(join(ROOT, '.env'), 'utf8').match(new RegExp('^\\s*' + n + '=(.*)$', 'm')) || [])[1]?.trim();
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || envFile('SUPABASE_SERVICE_ROLE_KEY');
const SB = (process.env.SUPABASE_URL || envFile('SUPABASE_URL') || '').replace(/\/+$/, '') + '/rest/v1';

async function sb(path, init = {}) {
  const r = await fetch(`${SB}/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// --- stessa normalizzazione di aifa-registro-prodotti.mjs/dispositivi-medici-registro.mjs ---
const FORME_SPAZIATE = /\b(s r l|s p a|s a s|s n c|b v|n v|a g|s a|l l c)\b/g;
const RUMORE = /\b(spa|srl|sas|snc|societa|italia|italy|group|holding|inc|ltd|limited|llc|gmbh|plc|co|corp|corporation|company|pharmaceuticals?|pharma|therapeutics?|biosciences?|biotech|sciences?|labs?|laboratories|and|the|nederland|deutschland|france|espana|europe)\b/g;
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
function ripulisciNomeAzienda(titolare) {
  const t = (titolare || '').trim().replace(/\s+/g, ' ');
  const tuttoMaiuscolo = t === t.toUpperCase() && /[A-Z]/.test(t);
  if (!tuttoMaiuscolo) return t;
  return t.split(' ').map((w) => {
    if (/^(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|b\.?v\.?|gmbh|a\/s|llc|inc\.?|ltd\.?|plc)$/i.test(w)) return w;
    return w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w;
  }).join(' ');
}
const FORMA_LEGALE = /\b(S\.?\s?P\.?\s?A\.?|S\.?\s?R\.?\s?L\.?|S\.?\s?N\.?\s?C\.?|S\.?\s?A\.?\s?S\.?|B\.?\s?V\.?|GMBH|LLC|INC\.?|LTD\.?|PLC|CO\.?\s?KG)\b\.?/i;

async function trovaUrlPdfIntegratori() {
  const paginaUrl = 'https://www.salute.gov.it/new/it/tema/alimenti-fini-medici-speciali-ed-integratori/registro-degli-integratori-alimentari';
  const r = await fetch(paginaUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' } });
  if (!r.ok) throw new Error(`Pagina registro integratori: HTTP ${r.status}`);
  const html = await r.text();
  const m = html.match(/href="([^"]*INTEGRATORI_NOTIFICATI_ORD_AZ[^"]*\.pdf)"/i);
  if (!m) throw new Error('Link PDF "per impresa" non trovato nella pagina del registro — verificare se la pagina e\' cambiata');
  const href = m[1];
  return href.startsWith('http') ? href : 'https://www.salute.gov.it' + href;
}

function parseRighe(testo) {
  const righe = testo.split('\n').map((r) => r.trim());
  const RUMORE_RIGA = [/^ELENCO IN ORDINE/, /^aggiornato al/, /^INTEGRATORI NOTIFICATI/, /^IMPRESA\s+PRODOTTO\s+CODICE$/, /^Pagina\s+\d+$/, /^-- \d+ of \d+ --$/];
  const eRumore = (t) => !t || RUMORE_RIGA.some((re) => re.test(t));

  const prodotti = [];
  let impresaCorrente = null;
  let buffer = [];

  function flush() {
    const testoCompleto = buffer.join(' ').replace(/\s+/g, ' ').trim();
    buffer = [];
    const m = testoCompleto.match(/^(.*?)\s*(\d+)\s*$/);
    if (!m) return;
    const primaParte = m[1];
    const codice = m[2];
    let impresa = null, prodotto;
    if (impresaCorrente && primaParte.toUpperCase().startsWith(impresaCorrente.toUpperCase())) {
      impresa = impresaCorrente;
      prodotto = primaParte.slice(impresaCorrente.length).trim();
    }
    if (!impresa) {
      const parole = primaParte.split(' ');
      let taglio = -1;
      for (let i = 0; i < Math.min(parole.length, 8); i++) {
        if (FORMA_LEGALE.test(parole[i])) { taglio = i; break; }
      }
      if (taglio >= 0) {
        impresa = parole.slice(0, taglio + 1).join(' ');
        prodotto = parole.slice(taglio + 1).join(' ');
      } else {
        impresa = parole.slice(0, 3).join(' ');
        prodotto = parole.slice(3).join(' ');
      }
    }
    prodotto = prodotto.trim();
    if (!prodotto || !impresa) return;
    prodotti.push({ impresa, prodotto, codice });
    impresaCorrente = impresa;
  }

  for (const riga of righe) {
    if (eRumore(riga)) continue;
    buffer.push(riga);
    if (/\d+$/.test(riga)) flush();
  }
  return prodotti;
}

async function main() {
  const push = console.log;
  push(`${B}${CLI_APPLY ? 'APPLICA' : 'MISURA (aggiungi --apply per scrivere)'}${Z}`);

  push(`${D}Scopro l'URL corrente del registro...${Z}`);
  const url = await trovaUrlPdfIntegratori();
  push(`${D}  ${url}${Z}`);

  push(`${D}Scarico il PDF (puo' richiedere qualche secondo, ~7-8 MB)...${Z}`);
  const rPdf = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' } });
  if (!rPdf.ok) throw new Error(`Download PDF: HTTP ${rPdf.status}`);
  const buf = Buffer.from(await rPdf.arrayBuffer());
  push(`${D}  scaricato: ${(buf.length / 1e6).toFixed(1)} MB${Z}`);

  push(`${D}Estraggo il testo...${Z}`);
  const parser = new PDFParse({ data: buf });
  const { text } = await parser.getText();

  push(`${D}Interpreto le righe (impresa/prodotto/codice)...${Z}`);
  const prodotti = parseRighe(text);
  const conteggioPerImpresa = new Map();
  prodotti.forEach((p) => conteggioPerImpresa.set(p.impresa, (conteggioPerImpresa.get(p.impresa) || 0) + 1));
  push(`${G}  ${prodotti.length} prodotti, ${conteggioPerImpresa.size} imprese distinte${Z}`);

  push(`${D}Carico l'anagrafica aziende attive...${Z}`);
  const aziende = await sb('companies?select=id,name&is_active=eq.true&merged_into=is.null&limit=4000');
  const perNomeNormTutti = new Map();
  aziende.forEach((a) => { const n = norm(a.name); if (!n) return; if (!perNomeNormTutti.has(n)) perNomeNormTutti.set(n, []); perNomeNormTutti.get(n).push(a); });
  const perNome = new Map();
  for (const [n, gruppo] of perNomeNormTutti) if (gruppo.length === 1) perNome.set(n, gruppo[0]);
  const conToken = aziende.map((a) => ({ a, tokens: tokenSet(norm(a.name)) })).filter((x) => x.tokens.size > 0);

  function accoppiaEsatto(nomeRegistro) {
    const n = norm(nomeRegistro);
    if (!n || n.length < 3) return null;
    return perNome.get(n) || null;
  }
  function accoppiaPerContenimento(nomeRegistro) {
    const tokensRegistro = tokenSet(norm(nomeRegistro));
    if (!tokensRegistro.size) return null;
    const candidati = conToken.filter(({ tokens }) => {
      if (tokens.size < 2) return false; // mai un solo token, vedi commento in testa al file
      return [...tokens].every((t) => tokensRegistro.has(t));
    });
    return candidati.length === 1 ? candidati[0].a : null;
  }

  const impreseDistinte = [...conteggioPerImpresa.keys()];
  const aziendaPerImpresa = new Map(); // impresa (testo registro) -> {id,name} azienda esistente
  const cacheMatch = new Map();
  let matchEsatto = 0, matchContenimento = 0;
  for (const imp of impreseDistinte) {
    if (cacheMatch.has(imp)) continue;
    let az = accoppiaEsatto(imp);
    if (az) matchEsatto++;
    else { az = accoppiaPerContenimento(imp); if (az) matchContenimento++; }
    cacheMatch.set(imp, az);
    if (az) aziendaPerImpresa.set(imp, az);
  }
  push(`${G}  abbinate ad aziende esistenti: ${aziendaPerImpresa.size}${Z} ${D}(${matchEsatto} esatto, ${matchContenimento} per contenimento)${Z}`);

  // Orfane candidate a nuova azienda: forma societaria vera + soglia prodotti
  const orfane = impreseDistinte.filter((imp) => !aziendaPerImpresa.has(imp));
  const candidateNuove = orfane
    .filter((imp) => /\b(S\.?P\.?A\.?|S\.?R\.?L\.?)\b/i.test(imp))
    .filter((imp) => conteggioPerImpresa.get(imp) >= SOGLIA_PRODOTTI_NUOVA_AZIENDA);
  const prodottiCandidateNuove = candidateNuove.reduce((s, imp) => s + conteggioPerImpresa.get(imp), 0);
  push(`${D}  orfane totali: ${orfane.length}, candidate a nuova azienda (S.p.A./S.r.l., >=${SOGLIA_PRODOTTI_NUOVA_AZIENDA} prodotti): ${candidateNuove.length} (${prodottiCandidateNuove} prodotti)${Z}`);

  if (!CLI_APPLY) {
    push(`\n${Y}Misura completata, nessuna scrittura. Esempi di aziende nuove candidate:${Z}`);
    candidateNuove.slice(0, 15).forEach((imp) => push(`  - ${ripulisciNomeAzienda(imp)} (${conteggioPerImpresa.get(imp)} prodotti)`));
    push(`\n${D}Rilancia con --apply per scrivere.${Z}`);
    return;
  }

  // companies ha un indice unico su lower(btrim(name)) — due voci diverse del
  // registro possono ridursi allo STESSO nome dopo ripulisciNomeAzienda() (es.
  // "EG S.P.A." e "eg S.p.A." capitalizzate diversamente nel PDF), facendo
  // fallire l'intero lotto con 23505 (bug reale trovato l'8/09/2026 al primo
  // tentativo di scrittura). Si raggruppa PRIMA sulla stessa chiave del
  // vincolo del database — una sola azienda per gruppo, ma tutte le varianti
  // grezze del registro restano mappate a quella stessa azienda, cosi' i loro
  // prodotti finiscono comunque tutti li'.
  const gruppiPerNomePulito = new Map(); // nome pulito (lower/trim) -> [imprese grezze]
  for (const imp of candidateNuove) {
    const chiave = ripulisciNomeAzienda(imp).trim().toLowerCase();
    if (!gruppiPerNomePulito.has(chiave)) gruppiPerNomePulito.set(chiave, []);
    gruppiPerNomePulito.get(chiave).push(imp);
  }
  const daCreare = [...gruppiPerNomePulito.entries()].map(([chiave, varianti]) => ({
    chiave,
    nome: ripulisciNomeAzienda(varianti.sort((a, b) => conteggioPerImpresa.get(b) - conteggioPerImpresa.get(a))[0]),
    varianti,
  }));
  if (daCreare.length < candidateNuove.length) push(`${D}  ${candidateNuove.length - daCreare.length} varianti duplicate sullo stesso nome ripulito, unificate${Z}`);

  push(`\n${D}Creo ${daCreare.length} aziende nuove...${Z}`);
  let aziendeCreate = 0, aziendeScartate = 0;
  // Stessa resilienza di scriviLotti() (lib/dedup-conflitto.mjs): se un lotto
  // fallisce (es. collisione con un nome gia' in anagrafica che il matching
  // fuzzy non aveva individuato) si riprova riga per riga, si perde solo la
  // riga in conflitto, non le altre 99.
  const creaUna = async (d) => {
    const creati = await sb('companies', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify([{ name: d.nome, sector_v2: 'Nutraceutical', entity_type: 'life_sciences', is_active: true }]) });
    return creati[0];
  };
  for (let i = 0; i < daCreare.length; i += 100) {
    const lotto = daCreare.slice(i, i + 100);
    const corpo = lotto.map((d) => ({ name: d.nome, sector_v2: 'Nutraceutical', entity_type: 'life_sciences', is_active: true }));
    try {
      const creati = await sb('companies', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(corpo) });
      creati.forEach((c, idx) => lotto[idx].varianti.forEach((imp) => aziendaPerImpresa.set(imp, c)));
      aziendeCreate += creati.length;
    } catch (e) {
      push(`${D}  lotto rifiutato (${String(e.message).slice(0, 70)}) - riprovo riga per riga${Z}`);
      for (const d of lotto) {
        try { const c = await creaUna(d); d.varianti.forEach((imp) => aziendaPerImpresa.set(imp, c)); aziendeCreate++; }
        catch (e2) { aziendeScartate++; push(`${D}    scartata "${d.nome}": ${String(e2.message).slice(0, 88)}${Z}`); }
      }
    }
  }
  push(`${G}  create ${aziendeCreate} aziende${Z}${aziendeScartate ? ` ${D}(${aziendeScartate} scartate per conflitto residuo)${Z}` : ''}`);

  push(`${D}Preparo le righe prodotto...${Z}`);
  const daScrivere = [];
  for (const p of prodotti) {
    const azienda = aziendaPerImpresa.get(p.impresa);
    if (!azienda) continue; // orfana sotto soglia, o titolare individuale: non importata
    daScrivere.push({
      company_id: azienda.id,
      brand_name: p.prodotto.slice(0, 300),
      active_ingredients_norm: null,
      device_category: null,
      category: 'commercializzato',
      fonte: 'registro_pubblico',
      source_proof: `Registro Integratori Alimentari Notificati (Min. Salute) — Impresa: ${p.impresa} — Codice: ${p.codice}`.slice(0, 400),
      source_url: url,
    });
  }
  push(`${D}  ${daScrivere.length} righe candidate (${aziendaPerImpresa.size} aziende coinvolte)${Z}`);

  push(`${D}Scarto quelle gia' presenti...${Z}`);
  const idAziendeCoinvolte = [...new Set(daScrivere.map((r) => r.company_id))];
  const chiaviGiaScritte = new Set();
  for (let i = 0; i < idAziendeCoinvolte.length; i += 50) {
    const lotto = idAziendeCoinvolte.slice(i, i + 50);
    const righe = await sb(`company_products?select=company_id,brand_name&company_id=in.(${lotto.join(',')})`);
    righe.forEach((r) => chiaviGiaScritte.add(chiaveProdotto(r)));
  }
  const daScrivereNuovi = daScrivere.filter((r) => !chiaviGiaScritte.has(chiaveProdotto(r)));
  const giaPresenti = daScrivere.length - daScrivereNuovi.length;
  if (giaPresenti) push(`${D}  ${giaPresenti} prodotti gia' presenti, saltati${Z}`);

  const logLotti = (m) => push(`${D}  ${m}${Z}`);
  const scritte = await scriviLotti(sb, 'company_products', daScrivereNuovi, chiaveProdotto, logLotti);
  push(`\n${G}${B}Completato: ${aziendeCreate} aziende create, ${scritte} prodotti scritti.${Z}`);
  push(`${Y}Nota: "notificato" non vuol dire "in commercio oggi" — vedi commento in testa al file. Un secondo script verifichera' via CORE quali prodotti sono davvero ancora sul sito ufficiale.${Z}`);
}

main().catch((e) => { console.error(`${R}ERRORE: ${e.message}${Z}`); console.error(e.stack); process.exit(1); });
