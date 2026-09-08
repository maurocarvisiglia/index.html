/**
 * PRODOTTI DA BANCA DATI FARMACI VETERINARI (Ministero della Salute)
 * =============================================================================
 *   node scripts/farmaci-veterinari-registro.mjs               misura, non scrive
 *   node scripts/farmaci-veterinari-registro.mjs --apply       scrive
 *
 * COSTO: ZERO — open data di dati.salute.gov.it/it/dataset/farmaci-veterinari,
 * nessuna chiamata AI. Stessa logica di scripts/aifa-registro-prodotti.mjs
 * (dato strutturato dal governo, zero rischio di allucinazione), qui applicata
 * ai farmaci veterinari.
 *
 * IL FILE CAMBIA NOME OGNI GIORNO (suffisso data, es.
 * "FRM_VET_2_90_20260908.csv", aggiornamento giornaliero dichiarato dal
 * Ministero): l'URL non va MAI hardcodato, si scopre ogni volta leggendo il
 * link dalla pagina del dataset.
 *
 * FORMATO: CSV a punto-e-virgola (non virgola come AIFA farmaci umani), colonne
 * medicinale_veterinario; codice_aic; codice_gtin; descrizione_confezione;
 * principio_attivo; specie; atc_vet; ragione_sociale; modalita_prescrizione;
 * data_inizio_commercializzazione; data_fine_commercializzazione;
 * informazioni_aggiuntive. Solo prodotti ANCORA in commercio
 * (data_fine_commercializzazione vuota o "-").
 *
 * ABBINAMENTO AZIENDE — due livelli (nessuna P.IVA nel CSV):
 *   1  ESATTO sul nome normalizzato
 *   2  CONTENIMENTO — sempre almeno 2 token distintivi in comune (mai un solo
 *      token: e' il bug reale trovato e corretto l'8/09/2026, vedi commenti in
 *      dispositivi-medici-registro.mjs/aifa-registro-prodotti.mjs)
 *
 * NESSUNA AZIENDA NUOVA CREATA — come dispositivi-medici-registro.mjs, non
 * come aifa-registro-prodotti.mjs: il farmaco veterinario e' un settore di
 * nicchia per il recruiting Life Sciences che questo progetto segue, e la
 * scala e' comunque piccola (~11.000 prodotti, poche centinaia di titolari
 * distinti) — si riportano solo i titolari orfani piu' frequenti per decidere
 * caso per caso, invece di espandere l'anagrafica in automatico come fatto per
 * gli integratori (dove la scala e la richiesta esplicita giustificavano la
 * creazione automatica).
 *
 * active_ingredients_norm lasciato SEMPRE NULL (a differenza dei farmaci
 * umani): mischiare principi attivi veterinari nello stesso campo usato da
 * trovaConcorrenti() per il punteggio concorrenti farmaco/classe terapeutica
 * farebbe apparire concorrenti "umani" un'azienda di solo mercato veterinario
 * che condivide per caso lo stesso principio attivo — mercati diversi, mai da
 * mescolare (stesso principio gia' applicato a farmaci/dispositivi separati).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { parse } from 'csv-parse/sync';
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

// --- stessa normalizzazione di aifa-registro-prodotti.mjs/dispositivi-medici-registro.mjs/integratori-registro.mjs ---
const FORME_SPAZIATE = /\b(s r l|s p a|s a s|s n c|b v|n v|a g|s a|l l c)\b/g;
const RUMORE = /\b(spa|srl|sas|snc|societa|italia|italy|group|holding|inc|ltd|limited|llc|gmbh|plc|co|corp|corporation|company|pharmaceuticals?|pharma|therapeutics?|biosciences?|biotech|sciences?|labs?|laboratories|and|the|nederland|deutschland|france|espana|europe|animal|health|internazional[ei]|international)\b/g;
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

async function trovaUrlCsv() {
  const paginaUrl = 'https://www.dati.salute.gov.it/it/dataset/farmaci-veterinari';
  const r = await fetch(paginaUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' } });
  if (!r.ok) throw new Error(`Pagina dataset: HTTP ${r.status}`);
  const html = await r.text();
  const m = html.match(/href="([^"]*FRM_VET[^"]*\.csv)"/i);
  if (!m) throw new Error('Link CSV non trovato nella pagina del dataset — verificare se la pagina e\' cambiata');
  const href = m[1];
  return href.startsWith('http') ? href : 'https://www.dati.salute.gov.it' + href;
}

async function main() {
  const push = console.log;
  push(`${B}${CLI_APPLY ? 'APPLICA' : 'MISURA (aggiungi --apply per scrivere)'}${Z}`);

  push(`${D}Scopro l'URL corrente del dataset...${Z}`);
  const url = await trovaUrlCsv();
  push(`${D}  ${url}${Z}`);

  push(`${D}Scarico il CSV...${Z}`);
  const rCsv = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' } });
  if (!rCsv.ok) throw new Error(`Download CSV: HTTP ${rCsv.status}`);
  const testoCsv = await rCsv.text();
  push(`${D}  scaricato: ${(testoCsv.length / 1e6).toFixed(1)} MB${Z}`);

  const righeCsv = parse(testoCsv, { columns: true, delimiter: ';', skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
  const inCommercio = righeCsv.filter((r) => {
    const fine = (r.data_fine_commercializzazione || '').trim();
    return !fine || fine === '-';
  });
  push(`${G}  ${righeCsv.length} righe totali, ${inCommercio.length} ancora in commercio${Z}`);

  push(`${D}Carico l'anagrafica aziende attive...${Z}`);
  const aziende = await sb('companies?select=id,name&is_active=eq.true&merged_into=is.null&limit=4000');
  const perNomeNormTutti = new Map();
  aziende.forEach((a) => { const n = norm(a.name); if (!n) return; if (!perNomeNormTutti.has(n)) perNomeNormTutti.set(n, []); perNomeNormTutti.get(n).push(a); });
  const perNome = new Map();
  for (const [n, gruppo] of perNomeNormTutti) if (gruppo.length === 1) perNome.set(n, gruppo[0]);
  const conToken = aziende.map((a) => ({ a, tokens: tokenSet(norm(a.name)) })).filter((x) => x.tokens.size > 0);

  function accoppiaEsatto(nomeCsv) {
    const n = norm(nomeCsv);
    if (!n || n.length < 3) return null;
    return perNome.get(n) || null;
  }
  function accoppiaPerContenimento(nomeCsv) {
    const tokensCsv = tokenSet(norm(nomeCsv));
    if (!tokensCsv.size) return null;
    const candidati = conToken.filter(({ tokens }) => {
      if (tokens.size < 2) return false;
      return [...tokens].every((t) => tokensCsv.has(t));
    });
    return candidati.length === 1 ? candidati[0].a : null;
  }

  const titolareRaw = new Map(); // ragione_sociale -> righe prodotto
  inCommercio.forEach((r) => {
    const t = (r.ragione_sociale || '').trim();
    if (!t) return;
    if (!titolareRaw.has(t)) titolareRaw.set(t, []);
    titolareRaw.get(t).push(r);
  });

  const aziendaPerTitolare = new Map();
  const cacheMatch = new Map();
  let matchEsatto = 0, matchContenimento = 0;
  for (const tit of titolareRaw.keys()) {
    if (cacheMatch.has(tit)) continue;
    let az = accoppiaEsatto(tit);
    if (az) matchEsatto++;
    else { az = accoppiaPerContenimento(tit); if (az) matchContenimento++; }
    cacheMatch.set(tit, az);
    if (az) aziendaPerTitolare.set(tit, az);
  }
  push(`${G}  abbinati ad aziende esistenti: ${aziendaPerTitolare.size}${Z} ${D}(${matchEsatto} esatto, ${matchContenimento} per contenimento) su ${titolareRaw.size} titolari distinti${Z}`);

  const orfani = [...titolareRaw.keys()].filter((t) => !aziendaPerTitolare.has(t));
  const orfaniOrdinati = orfani.map((t) => ({ titolare: t, n: titolareRaw.get(t).length })).sort((a, b) => b.n - a.n);
  push(`${D}  titolari orfani: ${orfani.length} (${orfani.reduce((s, t) => s + titolareRaw.get(t).length, 0)} prodotti non importati) — nessuna azienda nuova creata, vedi commento in testa al file${Z}`);
  if (orfaniOrdinati.length) {
    push(`${D}  i 10 piu' frequenti (per decidere caso per caso se aggiungerli a mano):${Z}`);
    orfaniOrdinati.slice(0, 10).forEach((o) => push(`${D}    - ${o.titolare} (${o.n} prodotti)${Z}`));
  }

  const daScrivere = [];
  for (const [tit, righe] of titolareRaw) {
    const azienda = aziendaPerTitolare.get(tit);
    if (!azienda) continue;
    righe.forEach((r) => {
      const nome = (r.medicinale_veterinario || '').trim();
      if (!nome) return;
      daScrivere.push({
        company_id: azienda.id,
        brand_name: nome.slice(0, 300),
        active_ingredients_norm: null,
        device_category: null,
        category: 'commercializzato',
        fonte: 'registro_pubblico',
        source_proof: `Banca Dati Farmaci Veterinari (Min. Salute) — Titolare: ${tit} — AIC: ${r.codice_aic || ''}`.slice(0, 400),
        source_url: url,
      });
    });
  }
  push(`${D}  ${daScrivere.length} righe candidate (${aziendaPerTitolare.size} aziende coinvolte)${Z}`);

  if (!CLI_APPLY) {
    push(`\n${Y}Misura completata, nessuna scrittura. Rilancia con --apply per scrivere.${Z}`);
    return;
  }

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
  push(`\n${G}${B}Completato: ${scritte} prodotti scritti.${Z}`);
}

main().catch((e) => { console.error(`${R}ERRORE: ${e.message}${Z}`); console.error(e.stack); process.exit(1); });
