/**
 * FATTURATO E DIPENDENTI · reportaziende.it · tutte le aziende del database
 * =============================================================================
 *   node scripts/core-fatturato-dipendenti-reportaziende.mjs                misura
 *   node scripts/core-fatturato-dipendenti-reportaziende.mjs --apply        scrive
 *   node scripts/core-fatturato-dipendenti-reportaziende.mjs 200            solo le prime 200 candidate
 *   node scripts/core-fatturato-dipendenti-reportaziende.mjs --ritenta-tutto  ignora il registro tentativi
 *
 * COSTO: ZERO — nessuna IA, nessuna chiave a pagamento. Solo fetch (gratis) su
 * dati che reportaziende.it pubblica liberamente e il cui robots.txt AMMETTE
 * esplicitamente la lettura da bot (Googlebot/Bingbot/ClaudeBot inclusi),
 * escludendo solo gli endpoint di ricerca/login a pagamento — che qui non si
 * usano mai: vedi sotto.
 *
 * IL PROBLEMA CHE RISOLVE
 * Misurato il 23/09/2026: 3.538 aziende su 3.666 attive non hanno
 * fatturato_range, 3.142 non hanno dipendenti — il grosso del database.
 * Apollo copre una parte, ma per moltissime aziende italiane il dato e'
 * pubblico per legge (bilanci depositati in Camera di Commercio) e
 * reportaziende.it lo espone in pagina gratis, senza login.
 *
 * PERCHE' NESSUNA RICERCA PER NOME — L'INDICE E' LA SITEMAP, NON search
 * Il sito ha una casella di ricerca ("Ricerca per p.Iva o denominazione"), ma
 * gira su un endpoint /search-exponents.php che il SUO STESSO robots.txt
 * disabilita per i bot, e che risulta comunque a pagamento ("disponibile solo
 * con un abbonamento" nel markup). Non si tocca: ne' bypassato ne' imitato.
 *
 * La sitemap (anch'essa dichiarata nel robots.txt, per definizione pensata per
 * essere letta da un crawler) e' un indice migliore: ogni URL azienda finisce
 * con "..._<provincia>_<partitaiva>" — la Partita IVA e' gia' nell'URL. Per le
 * 945 aziende di cui conosciamo gia' la P.IVA (companies.iva) l'abbinamento e'
 * quindi ESATTO, zero ambiguita': si cerca quella stringa nell'indice, non un
 * nome che puo' assomigliare a un'altra azienda.
 *
 * PER LE AZIENDE SENZA P.IVA NOTA (la maggioranza)
 * Si prova un abbinamento per nome normalizzato (stessa normalizeCompanyName
 * dell'app: minuscolo, via forma legale/paese) contro il nome nello slug,
 * normalizzato allo stesso modo. Se piu' aziende del sitemap producono la
 * STESSA chiave normalizzata (omonimi in citta' diverse — capita), non si
 * indovina: si salta. Anche con un solo candidato, la pagina va comunque
 * verificata: la Ragione Sociale che la pagina dichiara deve corrispondere
 * (stessa normalizzazione) prima di scrivere qualunque dato — l'anti-errore
 * qui non e' "la frase esiste nel testo" (non serve, non c'e' IA che genera
 * un fatto) ma "l'identificativo legale sulla pagina e' quello giusto".
 *
 * COSA SCRIVE
 * Solo companies.fatturato_range e companies.dipendenti, e SOLO se sono oggi
 * NULL — non sovrascrive mai un dato gia' presente (potrebbe venire da Apollo
 * o da una verifica manuale piu' recente). Se la pagina rivela anche la P.IVA
 * e companies.iva era vuoto, la si scrive: rende piu' sicuri i prossimi run su
 * questa stessa azienda (e su ogni altro script futuro che la usi per
 * abbinare). Ogni tentativo (trovato o no) finisce nel registro
 * company_facts_lookup_log (tipo 'fatturato_dipendenti_reportaziende'),
 * cosi' un run interrotto si puo' riprendere senza ripartire da zero.
 *
 * CORTESIA VERSO IL SITO TERZO
 * Un fetch alla volta, mai in parallelo; una pausa tra una pagina e l'altra.
 * Non e' un limite imposto da loro (nessun 429 osservato) — e' la stessa
 * disciplina "non si martella un sito che non e' nostro" gia' in uso per i
 * siti ufficiali delle aziende in core-recupero-gratuito.mjs.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', D = '\x1b[2m', B = '\x1b[1m', Z = '\x1b[0m';

const APPLY = process.argv.includes('--apply');
const RITENTA = process.argv.includes('--ritenta-tutto');
const RICOSTRUISCI_INDICE = process.argv.includes('--ricostruisci-indice');
const argLimite = process.argv.find((a) => /^\d+$/.test(a));
const LIMITE = argLimite === undefined ? 9999 : Number(argLimite);

const env = (n) => (readFileSync(join(ROOT, '.env'), 'utf8').match(new RegExp('^\\s*' + n + '=(.*)$', 'm')) || [])[1]?.trim();
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const ANON = html.match(/eyJhbGciOiJIUzI1NiIs[A-Za-z0-9_.-]{40,}/)[0];
const SB = (env('SUPABASE_URL') || '').replace(/\/+$/, '') + '/rest/v1';

async function sb(path, init = {}) {
  const k = init.method && init.method !== 'GET' ? SERVICE : ANON;
  const r = await fetch(`${SB}/${path}`, { ...init, headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path}: ${(await r.text()).slice(0, 160)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// La STESSA normalizzazione usata in index.html (normalizeCompanyName): tolta
// solo la forma legale/paese, non altre parole — deliberatamente identica,
// per non introdurre un secondo criterio di "azienda uguale" nel sistema.
function normalizeCompanyName(name) {
  if (!name) return '';
  let n = name.toLowerCase();
  n = n.replace(/\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|s\.?t\.?p\.?|ltd|inc|italia|italy|s\.?u\.?|società|per azioni|a responsabilità limitata|unipersonale|in breve.*|o .*società.*)\b/gi, '');
  n = n.replace(/[.,'’\-–—()]/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

// Lo slug reportaziende.it e' la ragione sociale sluggificata (underscore al
// posto di spazi/punteggiatura) + "_provincia_partitaiva". Per confrontarlo
// con un nostro nome serve la STESSA pulizia di normalizeCompanyName, applicata
// al testo dello slug con gli underscore riportati a spazi prima.
function normalizzaSlug(slug) {
  return normalizeCompanyName(slug.replace(/_/g, ' '));
}

const UA = 'Mozilla/5.0 (compatible; MCPharmaResearch/1.0; +ricerca interna aziende Life Sciences Italia)';

async function scarica(url, testo = false) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 15000);
  try {
    const r = await fetch(url, { signal: stop.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'it-IT,it;q=0.9' } });
    if (!r.ok) return null;
    return testo ? await r.text() : Buffer.from(await r.arrayBuffer());
  } catch { return null; }
  finally { clearTimeout(timer); }
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 1 — indice locale dalla sitemap (solo le voci che ci servono, per
// tenere la memoria piccola anche se il sito ne pubblica milioni)
// ─────────────────────────────────────────────────────────────────────────────
const CACHE = join(ROOT, 'dati-passate', 'indice-reportaziende.json');

async function costruisciIndice(pivaWanted, nomiWanted) {
  if (!RICOSTRUISCI_INDICE && existsSync(CACHE)) {
    const eta = Date.now() - statSync(CACHE).mtimeMs;
    if (eta < 30 * 24 * 3600 * 1000) { // sitemap changefreq dichiarato: monthly
      console.log(`${D}riuso indice in cache (${CACHE}), meno di 30 giorni${Z}`);
      return JSON.parse(readFileSync(CACHE, 'utf8'));
    }
  }

  console.log(`${B}costruzione indice da sitemap reportaziende.it${Z} ${D}(una tantum, poi in cache 30gg)${Z}`);
  const robots = await scarica('https://www.reportaziende.it/robots.txt', true);
  const urlIndice = (robots || '').match(/Sitemap:\s*(\S+)/i)?.[1];
  if (!urlIndice) throw new Error('sitemap non dichiarata in robots.txt — sito cambiato, va rivisto a mano');

  const indiceXml = await scarica(urlIndice, true);
  const sotto = [...(indiceXml || '').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    .filter((u) => !/\/(regioni|province|comuni)\.xml/.test(u));
  console.log(`${D}${sotto.length} sitemap aziende da scandire${Z}`);

  const perPiva = {}, perNome = {};
  for (let i = 0; i < sotto.length; i++) {
    const buf = await scarica(sotto[i]);
    if (!buf) { console.log(`${Y}  [${i + 1}/${sotto.length}] scaricamento fallito, salto${Z}`); continue; }
    let xml;
    try { xml = gunzipSync(buf).toString('utf8'); } catch { console.log(`${Y}  [${i + 1}/${sotto.length}] gunzip fallito, salto${Z}`); continue; }
    let n = 0;
    for (const m of xml.matchAll(/<loc>https:\/\/www\.reportaziende\.it\/([^<]+)<\/loc>/g)) {
      const slug = m[1];
      const mm = slug.match(/^(.+)_([a-z]{2})_(\d{11})$/i);
      if (!mm) continue;
      const [, nomeSlug, , piva] = mm;
      if (pivaWanted.has(piva)) perPiva[piva] = slug;
      const chiave = normalizzaSlug(nomeSlug);
      if (chiave && nomiWanted.has(chiave)) (perNome[chiave] ??= []).push(slug);
      n++;
    }
    process.stdout.write(`\r${D}  [${i + 1}/${sotto.length}] ${n} url lette${' '.repeat(10)}${Z}`);
    await new Promise((ok) => setTimeout(ok, 150));
  }
  console.log('');

  const indice = { costruito_il: new Date().toISOString(), perPiva, perNome };
  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(indice), 'utf8');
  console.log(`${G}indice pronto: ${Object.keys(perPiva).length} per P.IVA · ${Object.keys(perNome).length} chiavi-nome${Z}\n`);
  return indice;
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 2 — estrazione dalla pagina azienda
// ─────────────────────────────────────────────────────────────────────────────
const BUCKET = (milioni) => milioni < 5 ? '<5M' : milioni < 20 ? '5-20M' : milioni < 100 ? '20-100M' : milioni < 250 ? '100-250M' : milioni < 500 ? '250-500M' : '>500M';

function estraiDallaPagina(pageHtml) {
  const out = {};

  // "MEDIGAS ITALIA S.R.L. (Assago, MI) - Fatturato € 82,99 Mln nel 2025 ..."
  const meta = pageHtml.match(/<meta name="description" content="([^"]+)"/i)?.[1] || '';
  const fm = meta.match(/Fatturato\s*€\s*([\d.,]+)\s*(Mila|Mln|Mld)/i);
  if (fm) {
    const valore = parseFloat(fm[1].replace(/\./g, '').replace(',', '.'));
    const milioni = fm[2].toLowerCase() === 'mila' ? valore / 1000 : fm[2].toLowerCase() === 'mld' ? valore * 1000 : valore;
    if (Number.isFinite(milioni) && milioni > 0) out.fatturato_range = BUCKET(milioni);
  }

  // array embedded lato JS coi dipendenti anno per anno: si prende l'ultimo
  // valore NON "N/A", non necessariamente l'ultimo anno in assoluto.
  const righeDip = [...pageHtml.matchAll(/"anno":"(\d{4})"[^}]*?"numero_dipendenti":"(\d+|N\\\/A)"/g)]
    .map((m) => ({ anno: Number(m[1]), dip: m[2] === 'N\\/A' ? null : Number(m[2]) }))
    .filter((r) => r.dip !== null)
    .sort((a, b) => b.anno - a.anno);
  if (righeDip.length) out.dipendenti = righeDip[0].dip;

  const piva = pageHtml.match(/<link rel="canonical" href="[^"]*_(\d{11})"/i)?.[1];
  if (piva) out.iva = piva;

  // Struttura reale verificata sulla pagina Medigas:
  // <div class="text-dark"><b>Ragione sociale</b></div><div class="fw-semibold">MEDIGAS ITALIA S.R.L.</div>
  const ragSoc = pageHtml.match(/<b>Ragione sociale<\/b><\/div>\s*<div class="fw-semibold">([^<]{4,120})<\/div>/i)?.[1]?.trim();
  if (ragSoc) out.ragione_sociale_pagina = ragSoc;

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORSA
// ─────────────────────────────────────────────────────────────────────────────
const aziende = await sb('companies?select=id,name,ragione_sociale,iva,fatturato_range,dipendenti&is_active=eq.true&merged_into=is.null&limit=5000');
const daCompletare = aziende.filter((a) => !a.fatturato_range || !a.dipendenti);

// company_facts_lookup_log e' revocata ad anon/authenticated (solo service role
// puo' leggerla) — sb() sceglie la chiave in base al METODO, non alla tabella,
// quindi qui va forzata la scrittura service-role anche per una GET.
const giaTentate = new Set(RITENTA ? [] :
  (await sb('company_facts_lookup_log?select=company_id&tipo=eq.fatturato_dipendenti_reportaziende',
    { headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE } })).map((x) => x.company_id));

let candidate = daCompletare.filter((a) => !giaTentate.has(a.id));
candidate = candidate.slice(0, LIMITE);

console.log(`\n${B}Fatturato e dipendenti da reportaziende.it${Z}`);
console.log(`${D}${daCompletare.length} aziende con almeno un campo mancante · ${giaTentate.size} gia' tentate (${RITENTA ? 'ignorate, --ritenta-tutto' : 'saltate'}) · in questa corsa: ${candidate.length} · ${APPLY ? 'SCRIVE' : 'solo misura'}${Z}\n`);

// L'indice va costruito sull'universo di TUTTE le aziende attive, non solo su
// `candidate` di QUESTA corsa: e' quello che va in cache su disco (fino a 30
// giorni), e una corsa successiva con un `candidate` diverso (es. con
// --ritenta-tutto, o dopo che altre righe sono state completate nel frattempo)
// deve trovare comunque la propria azienda nell'indice. Un indice costruito
// sul solo `candidate` locale e' un bug reale che si e' gia' presentato: un
// run di misura su 50 aziende ha scritto una cache minuscola, e il run
// successivo su tutte le 3.539 l'ha riusata cosi' com'era (fresca meno di 30
// giorni) invece di ricostruirla — 3.507 "non trovate" false su aziende come
// Menarini o Takeda che sono sicuramente sul registro.
const pivaWanted = new Set(aziende.filter((a) => a.iva).map((a) => a.iva));
const nomiWanted = new Set(aziende.filter((a) => !a.iva).map((a) => normalizeCompanyName(a.name)).filter(Boolean));

const indice = await costruisciIndice(pivaWanted, nomiWanted);

async function registra(az, esito, note) {
  if (!APPLY) return;
  try {
    await sb('company_facts_lookup_log?on_conflict=company_id,tipo', {
      method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify([{ company_id: az.id, tipo: 'fatturato_dipendenti_reportaziende', esito, note: note ? String(note).slice(0, 200) : null }]),
    });
  } catch { /* volutamente silenzioso */ }
}

let scritte = 0, nonAbbinate = 0, ambigue = 0, nonConfermate = 0, senzaDatiUtili = 0, errori = 0;

for (const az of candidate) {
  process.stdout.write(`${D}▸${Z} ${az.name.slice(0, 40).padEnd(42)}`);
  try {
    let slug = null, motivoSalto = null;
    if (az.iva && indice.perPiva[az.iva]) {
      slug = indice.perPiva[az.iva];
    } else if (!az.iva) {
      const chiave = normalizeCompanyName(az.name);
      const candidati = indice.perNome[chiave] || [];
      if (candidati.length === 1) slug = candidati[0];
      else if (candidati.length > 1) motivoSalto = `${candidati.length} candidati omonimi, ambiguo`;
    }
    if (!slug) {
      if (motivoSalto) { ambigue++; await registra(az, 'nessun_dato', motivoSalto); console.log(`${Y}${motivoSalto}${Z}`); }
      else { nonAbbinate++; await registra(az, 'nessun_dato', 'non presente nell\'indice sitemap'); console.log(`${D}non trovata sul sito${Z}`); }
      continue;
    }

    const pageHtml = await scarica(`https://www.reportaziende.it/${slug}`, true);
    await new Promise((ok) => setTimeout(ok, 400));
    if (!pageHtml) { errori++; await registra(az, 'errore', 'pagina non raggiungibile'); console.log(`${R}pagina non raggiungibile${Z}`); continue; }

    const dati = estraiDallaPagina(pageHtml);

    // Verifica identita': se conoscevamo gia' la P.IVA, la pagina la deve
    // ripetere identica (e' cosi' per costruzione, dato che l'abbiamo trovata
    // cercandola — ma un controllo esplicito non costa nulla e blinda contro
    // un bug futuro). Se abbinato per nome, la ragione sociale dichiarata in
    // pagina deve corrispondere al nostro nome normalizzato.
    if (az.iva && dati.iva && dati.iva !== az.iva) { nonConfermate++; await registra(az, 'azienda_non_confermata', 'P.IVA sulla pagina diversa da quella attesa'); console.log(`${Y}P.IVA non corrisponde${Z}`); continue; }
    if (!az.iva && dati.ragione_sociale_pagina) {
      const a1 = normalizeCompanyName(dati.ragione_sociale_pagina), a2 = normalizeCompanyName(az.name);
      if (a1 && a2 && a1 !== a2 && !a1.includes(a2) && !a2.includes(a1)) {
        nonConfermate++; await registra(az, 'azienda_non_confermata', `ragione sociale pagina "${dati.ragione_sociale_pagina}" non corrisponde`);
        console.log(`${Y}ragione sociale non corrisponde${Z}`); continue;
      }
    }

    const patch = {};
    if (!az.fatturato_range && dati.fatturato_range) patch.fatturato_range = dati.fatturato_range;
    if (!az.dipendenti && dati.dipendenti) patch.dipendenti = dati.dipendenti;
    if (!az.iva && dati.iva) patch.iva = dati.iva;

    if (!Object.keys(patch).length) { senzaDatiUtili++; await registra(az, 'nessun_dato', 'pagina trovata, niente di nuovo da scrivere'); console.log(`${D}nessun dato utile in pagina${Z}`); continue; }

    if (APPLY) {
      await sb(`companies?id=eq.${az.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
    }
    scritte++;
    await registra(az, 'con_dato', Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(' '));
    console.log(`${G}${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(' · ')}${Z}`);
  } catch (e) {
    errori++;
    await registra(az, 'errore', e.message);
    console.log(`${R}${String(e.message).slice(0, 80)}${Z}`);
  }
}

console.log(`\n${'─'.repeat(84)}`);
console.log(`${B}RISULTATO${Z} su ${candidate.length} aziende · costo 0,00 $`);
console.log(`  ${G}scritte: ${scritte}${Z} · non trovate sul sito: ${nonAbbinate} · omonimi ambigui saltati: ${ambigue}`);
console.log(`  identita' non confermata: ${nonConfermate} · trovate ma senza dato utile: ${senzaDatiUtili} · errori: ${errori}`);
if (!APPLY) console.log(`\n  ${Y}misura soltanto: nulla scritto sul database. Rilancia con --apply per scrivere.${Z}\n`);
else console.log('');
