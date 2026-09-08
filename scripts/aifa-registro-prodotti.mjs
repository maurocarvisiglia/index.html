/**
 * PRODOTTI DA REGISTRI PUBBLICI AIFA · Classe A + Classe H + Equivalenti
 * =============================================================================
 *   node scripts/aifa-registro-prodotti.mjs               misura, non scrive
 *   node scripts/aifa-registro-prodotti.mjs --apply       scrive
 *
 * COSTO: ZERO — 3 CSV pubblici scaricati da aifa.gov.it, nessuna chiamata AI.
 * Dato strutturato dal governo (nome commerciale + principio attivo +
 * azienda titolare AIC gia' scritti dentro il CSV): zero rischio di
 * allucinazione, a differenza dell'estrazione da testo libero di
 * core-prodotti-giornaliero.mjs (fonte diversa, non sostituita da questa).
 *
 * PERCHE' TRE FILE E NON UNO
 *   · Classe_A_per_nome_commerciale: farmaci rimborsati SSN, di marca E
 *     equivalenti insieme — la fonte con piu' copertura per i grandi Pharma.
 *   · Classe_H_per_nome_commerciale: farmaci ospedalieri (spesso malattie
 *     rare/oncologia) — assenti dalla Classe A per definizione.
 *   · Lista_farmaci_equivalenti: gli stessi principi attivi ripetuti per
 *     ogni produttore di equivalente — qui sta la copertura delle aziende
 *     di soli generici (Doc Generici, EG, Teva, Sandoz...), quasi assenti
 *     nelle prime due liste sotto il proprio nome.
 *
 * REQUISITO DB: fonte='registro_pubblico' deve esistere nel CHECK di
 * company_products.fonte — vedi db/PARTE_13_company_products_fonte_registro_pubblico.sql
 * (va eseguito su Supabase prima di lanciare questo script con --apply).
 *
 * ABBINAMENTO AZIENDE — due livelli, entrambi conservativi:
 *   1  ESATTO sul nome normalizzato (come sync-market-radar.mjs)
 *   2  CONTENIMENTO DI PAROLE: se l'insieme di parole di un'azienda GIA'
 *      in anagrafica e' un SOTTOINSIEME dell'insieme di parole del
 *      titolare AIC (es. azienda="pfizer", titolare="pfizer europe ma
 *      eeig" -> {pfizer} ⊆ {pfizer,europe,ma,eeig}), e SOLO UNA azienda
 *      soddisfa il contenimento, si accetta — decisione esplicita di
 *      Mauro il 05/09/2026 ("assegna anche se le anagrafiche sono
 *      leggermente diverse"). Il confronto per PREFISSO di stringa resta
 *      escluso (vedi sync-market-radar.mjs: "E-PHARMA" vs "E Tech Group"
 *      era un prefisso valido ma un falso positivo — il contenimento per
 *      insieme di parole non ha lo stesso problema, perche' un token da 1
 *      carattere non supera il filtro di lunghezza minima sotto).
 *   3  Titolari senza nessuna azienda corrispondente (ne' esatta ne' per
 *      contenimento) vengono CREATI come nuove righe in companies — sono
 *      aziende reali con un farmaco autorizzato in Italia, non prospect
 *      esteri come nel caso di Market Radar.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { chiaveProdotto, scriviLotti } from './lib/dedup-conflitto.mjs';
import { costruisciLookupAtc, normalizzaPrincipioAttivo } from './lib/atc-lookup.mjs';
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

const ALIAS = new Map([
  ['glaxosmithkline', 'gsk'],
  ['merck sharp dohme', 'msd'],
]);

// Token minimo 4 caratteri: esclude sigle corte ("ma", "eeig" resta ammesso
// a 4, "sa"/"bv" no) che darebbero contenimenti troppo larghi.
function tokenSet(nomeNorm) {
  return new Set(nomeNorm.split(' ').filter((t) => t.length >= 4));
}

// Parole di CATEGORIA (non brand) che RUMORE non copre gia' — varianti non
// standard ("pharm"/"pharmac" abbreviati, "laboratoires" francese) o termini
// generici che compaiono in moltissime ragioni sociali diverse. Trovate il
// 05/09/2026 rileggendo TUTTI gli abbinamenti per contenimento uno per uno:
// "So.Se. Pharm S.r.l." (-> {pharm}) aveva agganciato 4 titolari scorrelati,
// "B.B.E. International S.r.l." (-> {international}) altri 3, "Laboratoires
// SVR Italia" (-> {laboratoires}) altri 4, "Euro-Pharma Srl" (-> {euro}) uno.
// Il problema non e' la lunghezza del token (4+ caratteri e' spesso giusto:
// "Ever"/"Lilly"/"Fidia" sono brand veri a 4-5 lettere) ma la sua GENERICITA'
// quando resta l'UNICO token del nome — qui si applica solo in quel caso.
const CATEGORIA_GENERICA = new Set([
  'pharm', 'pharma', 'pharmac', 'farma', 'farmaceutici', 'research', 'solutions',
  'international', 'life', 'health', 'medical', 'care', 'laboratoires', 'laboratori',
  'diagnostics', 'service', 'services', 'euro', 'med', 'industrie', 'industries',
]);

function ripulisciNomeAzienda(titolare) {
  const t = (titolare || '').trim().replace(/\s+/g, ' ');
  const tuttoMaiuscolo = t === t.toUpperCase() && /[A-Z]/.test(t);
  if (!tuttoMaiuscolo) return t;
  return t.split(' ').map((w) => {
    if (/^(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|b\.?v\.?|gmbh|a\/s|llc|inc\.?|ltd\.?|plc)$/i.test(w)) return w;
    return w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w;
  }).join(' ');
}

const FONTI = [
  { url: 'https://www.aifa.gov.it/documents/20142/3815901/Classe_A_per_nome_commerciale_30-04-2026.csv',
    label: 'Classe A', paginaFonte: 'https://www.aifa.gov.it/liste-farmaci-a-h', colTitolare: 'Titolare AIC', colDenom: 'Denominazione e Confezione', colPrincipio: 'Principio attivo' },
  { url: 'https://www.aifa.gov.it/documents/20142/3815901/Classe_H_per_nome_commerciale_30-04-2026.csv',
    label: 'Classe H', paginaFonte: 'https://www.aifa.gov.it/liste-farmaci-a-h', colTitolare: 'Titolare AIC', colDenom: 'Denominazione e Confezione', colPrincipio: 'Principio attivo' },
  { url: 'https://www.aifa.gov.it/documents/20142/825643/Lista_farmaci_equivalenti.csv',
    label: 'Equivalenti', paginaFonte: 'https://www.aifa.gov.it/liste-di-trasparenza', colTitolare: 'Ditta', colDenom: 'Farmaco', colPrincipio: 'Principio attivo' },
];

// db/PARTE_22: Classe H = farmaci ospedalieri, Classe A + Equivalenti = farmaci
// rimborsati SSN/farmacia. Distinzione diversa da "da banco" (OTC, mai
// importata: servirebbe la Classe C AIFA, che non scarichiamo).
function regimeFarmacoPerLabel(label) {
  if (label === 'Classe H') return 'ospedaliero';
  if (label === 'Classe A' || label === 'Equivalenti') return 'rimborsato_ssn';
  return null;
}

// Parser CSV completo (non un semplice split per riga): un campo tra
// virgolette puo' contenere un vero a-capo (successo per davvero in
// Lista_farmaci_equivalenti.csv, 3 righe su 8511 — bug reale del 06/09/2026,
// scoperto perche' aveva prodotto 3 aziende fantasma con per nome un codice
// di gruppo equivalenza invece del titolare vero: "JDQ", "JNC", "G3C").
// Uno split ingenuo su '\n' spezza quella riga in due, e i campi successivi
// slittano — qui invece si scandisce carattere per carattere, e un a-capo
// dentro le virgolette resta PARTE del campo invece di terminare la riga.
function parseCSV(testo) {
  const righe = [];
  let riga = [];
  let campo = '';
  let inQuote = false;
  for (let i = 0; i < testo.length; i++) {
    const ch = testo[i];
    if (inQuote) {
      if (ch === '"') {
        if (testo[i + 1] === '"') { campo += '"'; i++; }
        else inQuote = false;
      } else campo += ch;
    } else if (ch === '"') inQuote = true;
    else if (ch === ';') { riga.push(campo); campo = ''; }
    else if (ch === '\r') { /* ignorato, gestito da \n */ }
    else if (ch === '\n') {
      riga.push(campo); campo = '';
      if (riga.some((c) => c !== '')) righe.push(riga);
      riga = [];
    } else campo += ch;
  }
  riga.push(campo);
  if (riga.some((c) => c !== '')) righe.push(riga);

  const header = righe[0];
  return righe.slice(1).map((cols) => {
    const obj = {};
    header.forEach((h, i) => { obj[h.trim()] = cols[i]; });
    return obj;
  });
}

// "CLENIL*soluz inal 200 erog 100 mcg" -> "CLENIL" (nome prodotto, senza confezione)
function nomeBase(denom) {
  return (denom || '').split('*')[0].trim();
}

async function runAifaRegistroDailyBatch(apply = CLI_APPLY) {
  const log = [];
  const push = (m) => { console.log(m); log.push(String(m).replace(/\x1b\[[0-9]+m/g, '')); };

  push(`\n${B}Registri pubblici AIFA -> company_products${Z}  ${D}${apply ? 'SCRIVE' : 'solo misura'} · costo 0,00 $${Z}\n`);

  // db/PARTE_23: il file Equivalenti (uno dei 3 scaricati sotto) ha una
  // colonna ATC mai letta finora — si scarica una volta qui e si applica a
  // TUTTE e 3 le fonti (non solo Equivalenti), via il principio attivo.
  push(`${D}Costruisco il lookup principio attivo -> ATC dal file Equivalenti...${Z}`);
  const lookupAtc = await costruisciLookupAtc().catch((e) => { push(`${Y}  lookup ATC non disponibile: ${e.message} — proseguo senza${Z}`); return new Map(); });
  push(`${D}  ${lookupAtc.size} principi attivi con ATC noto${Z}`);

  let aziende = await sb('companies?select=id,name,is_active,merged_into&limit=4000');
  let attive = aziende.filter((c) => c.is_active && !c.merged_into);

  function costruisciIndici(lista) {
    const perNomeTutti = new Map();
    for (const c of lista) {
      const n = norm(c.name);
      if (!n) continue;
      if (!perNomeTutti.has(n)) perNomeTutti.set(n, []);
      perNomeTutti.get(n).push(c);
    }
    const perNome = new Map();
    for (const [n, gruppo] of perNomeTutti) if (gruppo.length === 1) perNome.set(n, gruppo[0]);
    // Per il contenimento: azienda -> suo token-set, solo se non vuoto
    const conToken = lista.map((c) => ({ c, tokens: tokenSet(norm(c.name)) })).filter((x) => x.tokens.size > 0);
    return { perNome, conToken };
  }
  let { perNome, conToken } = costruisciIndici(attive);

  function accoppiaEsatto(nomeEstero) {
    const n = norm(nomeEstero);
    if (!n || n.length < 3) return null;
    return perNome.get(n) || perNome.get(ALIAS.get(n) || ' ') || null;
  }
  function accoppiaPerContenimento(nomeEstero) {
    const titolareTokens = tokenSet(norm(nomeEstero));
    if (!titolareTokens.size) return null;
    const candidati = conToken.filter(({ tokens }) => {
      // Un solo token distintivo non basta MAI, generico o no — non solo
      // quando e' in CATEGORIA_GENERICA. Stesso bug trovato l'8/09/2026 nel
      // gemello di questo script per i dispositivi medici
      // (dispositivi-medici-registro.mjs): "Orion Pharma S.R.L." si riduceva
      // al solo token "orion" e abbinava per contenimento fabbricanti esteri
      // completamente estranei che condividevano solo quella parola (Sun
      // Pharma -> "Sun Medical", Leo Pharma -> "Leo Medical", CHR Hansen ->
      // "Hansen Medical", ecc. — 8 aziende reali coinvolte). Stessa logica di
      // matching, stesso rischio: richiede sempre almeno 2 token distintivi.
      if (tokens.size < 2) return false;
      return [...tokens].every((t) => titolareTokens.has(t));
    });
    return candidati.length === 1 ? candidati[0].c : null;
  }

  // company_id|nome_prodotto_lower -> riga company_products
  const trovati = new Map();
  const aziendeMatchate = new Set();
  const matchPerContenimento = [];
  // nome normalizzato del titolare -> {titolareRappresentativo, righe grezze[]}.
  // Chiave sul nome NORMALIZZATO, non sul testo esatto: "CSL Behring GmbH" e
  // "CSL BEHRING GMBH" (stesso titolare, maiuscole diverse fra un CSV e
  // l'altro) devono finire nello stesso gruppo, altrimenti si creano due
  // aziende per lo stesso titolare e la seconda scrittura viola l'unicita'
  // del nome in companies (bug reale del 05/09/2026, corretto qui).
  const orfani = new Map();
  let righeLette = 0;

  for (const fonte of FONTI) {
    push(`${D}Scarico ${fonte.label}...${Z}`);
    const res = await fetch(fonte.url);
    if (!res.ok) { push(`${R}  ${fonte.label}: HTTP ${res.status}, salto${Z}`); continue; }
    const buf = await res.arrayBuffer();
    const testo = Buffer.from(buf).toString('latin1'); // i CSV AIFA sono Windows-1252/Latin1
    const righe = parseCSV(testo);
    push(`${D}  ${righe.length} righe${Z}`);

    for (const r of righe) {
      righeLette++;
      const titolare = r[fonte.colTitolare];
      const nome = nomeBase(r[fonte.colDenom]);
      if (!titolare || !nome || nome.length < 2) continue;
      const principio = (r[fonte.colPrincipio] || '').trim() || null;

      let lsi = accoppiaEsatto(titolare);
      let viaContenimento = false;
      if (!lsi) { lsi = accoppiaPerContenimento(titolare); viaContenimento = !!lsi; }

      if (!lsi) {
        const chiaveNorm = norm(titolare);
        if (!chiaveNorm) continue;
        if (!orfani.has(chiaveNorm)) orfani.set(chiaveNorm, { titolareRappresentativo: titolare, righe: [] });
        orfani.get(chiaveNorm).righe.push({ titolare, nome, principio, fonteLabel: fonte.label, denomOriginale: r[fonte.colDenom], paginaFonte: fonte.paginaFonte });
        continue;
      }

      if (viaContenimento) matchPerContenimento.push({ titolare, azienda: lsi.name });
      aziendeMatchate.add(lsi.id);
      const chiave = lsi.id + '|' + nome.toLowerCase();
      if (!trovati.has(chiave)) {
        trovati.set(chiave, {
          company_id: lsi.id, brand_name: nome,
          active_ingredients: principio ? [principio] : null,
          category: 'commercializzato', fonte: 'registro_pubblico',
          regime_farmaco: regimeFarmacoPerLabel(fonte.label),
          atc_code: principio ? lookupAtc.get(normalizzaPrincipioAttivo(principio)) || null : null,
          source_proof: `${fonte.label} AIFA — Titolare AIC: ${titolare}${viaContenimento ? ' (abbinata per nome simile a "' + lsi.name + '")' : ''} — ${r[fonte.colDenom]}`.slice(0, 400),
          source_url: fonte.paginaFonte,
        });
      }
    }
  }

  push(`\n${'─'.repeat(80)}`);
  push(`  righe lette (3 liste) ................ ${righeLette}`);
  push(`  ${G}aziende collegate ..................... ${aziendeMatchate.size}${Z} ${D}(di cui ${matchPerContenimento.length ? new Set(matchPerContenimento.map(m=>m.azienda)).size : 0} per nome simile, non esatto)${Z}`);
  push(`  ${Y}titolari senza azienda corrispondente . ${orfani.size}${Z} ${D}(diventeranno nuove aziende)${Z}`);
  push(`  ${G}prodotti distinti (aziende esistenti) . ${trovati.size}${Z}`);

  if (matchPerContenimento.length) {
    push(`\n  ${D}Esempi di abbinamento per nome simile:${Z}`);
    const visti = new Set();
    for (const m of matchPerContenimento) {
      const k = m.titolare + '|' + m.azienda;
      if (visti.has(k)) continue;
      visti.add(k);
      if (visti.size > 15) break;
      push(`    "${m.titolare}" -> "${m.azienda}"`);
    }
  }

  const daScrivereEsistenti = [...trovati.values()];
  const summary = {
    righeLette, aziendeCollegate: aziendeMatchate.size, aziendeNuove: orfani.size,
    prodottiEsistenti: daScrivereEsistenti.length, prodottiNuoveAziende: 0, prodottiScritti: 0, aziendeCreate: 0,
  };

  if (!apply) {
    // Stima quanti prodotti distinti avrebbero le nuove aziende, per dare un
    // numero completo anche in sola misura (senza crearle davvero).
    let stimaProdottiNuovi = 0;
    for (const { righe } of orfani.values()) stimaProdottiNuovi += new Set(righe.map((r) => r.nome.toLowerCase())).size;
    summary.prodottiNuoveAziende = stimaProdottiNuovi;
    push(`\n  ${D}Se applicato: creerebbe ${orfani.size} aziende nuove con circa ${stimaProdottiNuovi} prodotti distinti in piu'.${Z}`);
    push(`\n  ${Y}misura soltanto: nulla scritto. Rilancia con --apply.${Z}\n`);
    return { summary, log };
  }

  const logLotti = (m) => push(`${D}  ${m}${Z}`);

  // company_products ha un indice unico su (company_id, lower(brand_name)),
  // ma e' un indice su ESPRESSIONE, non su colonne: PostgREST accetta in
  // on_conflict solo nomi di colonna, quindi on_conflict=<nome indice> fallisce
  // con 42703 ("colonna inesistente") appena c'e' un conflitto vero (bug reale
  // del 05/09/2026). Soluzione: niente ON CONFLICT, si scarta a monte cio' che
  // esiste gia' e si fa un INSERT semplice — che non puo' piu' violare
  // l'indice perche' i duplicati sono gia' stati tolti prima di scrivere.
  async function prodottiEsistentiPerAziende(ids) {
    const set = new Set();
    for (let i = 0; i < ids.length; i += 50) {
      const lotto = ids.slice(i, i + 50);
      const righe = await sb(`company_products?select=company_id,brand_name&company_id=in.(${lotto.join(',')})`);
      for (const r of righe) set.add(chiaveProdotto(r));
    }
    return set;
  }

  // 1) prodotti delle aziende gia' esistenti: scarta quelli che ci sono gia'
  const idAziendeEsistenti = [...aziendeMatchate];
  const chiaviGiaScritte = await prodottiEsistentiPerAziende(idAziendeEsistenti);
  const daScrivereEsistentiNuovi = daScrivereEsistenti.filter((r) => !chiaviGiaScritte.has(chiaveProdotto(r)));
  const giaPresenti = daScrivereEsistenti.length - daScrivereEsistentiNuovi.length;
  if (giaPresenti) push(`${D}  ${giaPresenti} prodotti gia' presenti in company_products, saltati${Z}`);
  let nP = await scriviLotti(sb, 'company_products', daScrivereEsistentiNuovi, chiaveProdotto, logLotti);

  // 2) crea le aziende orfane (una per gruppo di nome normalizzato), poi i
  // loro prodotti. Dedup anche sul nome ripulito: due titolari normalizzati
  // diversi potrebbero comunque ripulirsi nello stesso "name" visibile, e
  // companies ha un indice unico su lower(btrim(name)).
  const vistiNome = new Map(); // nome ripulito (lower) -> chiaveNorm sopravvissuta
  const aliasChiaveNorm = new Map(); // chiaveNorm scartata -> chiaveNorm sopravvissuta
  const nuoveRighe = [];
  for (const [chiaveNorm, { titolareRappresentativo }] of orfani) {
    const name = ripulisciNomeAzienda(titolareRappresentativo);
    const nomeKey = name.trim().toLowerCase();
    if (vistiNome.has(nomeKey)) { aliasChiaveNorm.set(chiaveNorm, vistiNome.get(nomeKey)); continue; }
    vistiNome.set(nomeKey, chiaveNorm);
    nuoveRighe.push({ chiaveNorm, name, ragione_sociale: titolareRappresentativo, entity_type: 'life_sciences', is_active: true });
  }
  push(`\n${D}Creo ${nuoveRighe.length} aziende nuove...${Z}`);
  let aziendeCreate = 0;
  const idPerChiaveNorm = new Map();
  const chiaveNormPerRagioneSociale = new Map(nuoveRighe.map((r) => [r.ragione_sociale, r.chiaveNorm]));
  for (let i = 0; i < nuoveRighe.length; i += 100) {
    const lotto = nuoveRighe.slice(i, i + 100).map(({ chiaveNorm, ...corpo }) => corpo);
    const creati = await sb('companies', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(lotto) });
    for (const c of creati) {
      const chiaveNorm = chiaveNormPerRagioneSociale.get(c.ragione_sociale);
      if (chiaveNorm) idPerChiaveNorm.set(chiaveNorm, c.id);
    }
    aziendeCreate += creati.length;
  }
  for (const [scartata, sopravvissuta] of aliasChiaveNorm) {
    const id = idPerChiaveNorm.get(sopravvissuta);
    if (id) idPerChiaveNorm.set(scartata, id);
  }
  push(`${G}  create ${aziendeCreate} aziende${Z}`);

  const daScrivereNuove = [];
  for (const [chiaveNorm, { righe: righeGrezze }] of orfani) {
    const companyId = idPerChiaveNorm.get(chiaveNorm);
    if (!companyId) continue;
    const visti = new Set();
    for (const rg of righeGrezze) {
      const k = rg.nome.toLowerCase();
      if (visti.has(k)) continue;
      visti.add(k);
      daScrivereNuove.push({
        company_id: companyId, brand_name: rg.nome,
        active_ingredients: rg.principio ? [rg.principio] : null,
        category: 'commercializzato', fonte: 'registro_pubblico',
        regime_farmaco: regimeFarmacoPerLabel(rg.fonteLabel),
        atc_code: rg.principio ? lookupAtc.get(normalizzaPrincipioAttivo(rg.principio)) || null : null,
        source_proof: `${rg.fonteLabel} AIFA — Titolare AIC: ${rg.titolare} — ${rg.denomOriginale}`.slice(0, 400),
        source_url: rg.paginaFonte,
      });
    }
  }
  const nP2 = await scriviLotti(sb, 'company_products', daScrivereNuove, chiaveProdotto, logLotti);

  summary.aziendeCreate = aziendeCreate;
  summary.prodottiNuoveAziende = nP2;
  summary.prodottiScritti = nP + nP2;
  push(`\n  ${G}scritti ${nP} prodotti (aziende esistenti) + ${nP2} prodotti (${aziendeCreate} aziende nuove) = ${nP + nP2} totali${Z}\n`);
  return { summary, log };
}

export { runAifaRegistroDailyBatch };

const isCLI = process.argv[1] && process.argv[1].includes('aifa-registro-prodotti.mjs');
if (isCLI) {
  runAifaRegistroDailyBatch().catch((e) => {
    console.error('❌ ERRORE TOP-LEVEL:', e.message);
    process.exit(1);
  });
}
