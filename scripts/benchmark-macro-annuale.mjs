/**
 * BENCHMARK MACRO ANNUALE · archivio di dati statistici aggregati da fonti
 * istituzionali pubbliche (AIFA/OsMed, Egualia/Nomisma...)
 * =============================================================================
 *   node scripts/benchmark-macro-annuale.mjs             misura (default)
 *   node scripts/benchmark-macro-annuale.mjs --apply      scrive
 *
 * Richiesto da Mauro il 14/09/2026 dopo aver valutato IQVIA/Egualia/OsMed
 * come possibili fonti per Rumors & Market Insight: questi dati NON sono
 * eventi puntuali (nomine, M&A, partnership) come market_rumors, sono
 * benchmark statistici aggregati (es. "il 52,2% dei pazienti asma/BPCO ha
 * bassa aderenza alla terapia") — schema separato (market_benchmarks),
 * aggiornamento MANUALE, non un cron giornaliero: questi rapporti escono
 * una volta l'anno.
 *
 * A DIFFERENZA di market-rumors-giornaliero.mjs, questo script NON scopre
 * dati da solo: la lista VOCI sotto e' curata a mano (chi legge il rapporto
 * decide quali numeri sono utili da archiviare), lo script si limita a
 * VERIFICARE che ogni citazione ("prova") esista davvero nel PDF scaricato
 * prima di scrivere — stessa disciplina anti-allucinazione di tutta la
 * famiglia CORE, mai un numero trascritto a memoria senza controllo diretto
 * della fonte. Se un domani esce il Rapporto OsMed 2025, si aggiungono nuove
 * voci a mano (stesso principio della lettura umana del documento), non si
 * automatizza l'estrazione: sono troppo pochi dati, in un documento troppo
 * lungo e vario, per farlo scoprire in autonomia a un modello senza rischio
 * di scegliere il numero sbagliato in un rapporto di 800+ pagine.
 *
 * FONTI VERIFICATE IL 14/09/2026 (lette per intero con pdf-parse, non solo
 * a occhio):
 *   - AIFA Rapporto OsMed 2024 (845 pagine) — dati su spesa per classe
 *     terapeutica, aderenza terapeutica, quota di farmaci equivalenti
 *   - Egualia/Nomisma "Osservatorio 2015-2025" executive summary (24
 *     pagine) — letto per intero, ma e' un'analisi qualitativa di
 *     economia industriale (concentrazione fornitori, costi energetici),
 *     NESSUN dato quantitativo regionale citabile trovato: nessuna voce
 *     Egualia in questo file per ora. Il rapporto completo (dietro un
 *     documento separato, non ancora verificato) potrebbe averne.
 *   - IQVIA Italia: NESSUNA fonte pubblica raggiungibile (nessuna newsroom
 *     o comunicati stampa Italia sul sito iqvia.com/it-it) — esclusa.
 *
 * IMPORTANTE: la correzione fatta il 14/09/2026 su un dato citato da
 * un'analisi esterna — "il Lazio ha una quota di equivalenti/generici del
 * 20-22%" — risultata FALSA alla verifica diretta (nel Rapporto OsMed 2024
 * quella fascia 19-22% e' Campania/Calabria/Basilicata/Sicilia, il Lazio
 * come Regione del Centro e' vicino al 34,2%) e' il motivo per cui questo
 * script non si fida di nessun numero non riscontrato riga per riga nel PDF
 * scaricato davvero.
 */

import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { PDFParse } from 'pdf-parse';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// ─────────────────────────────────────────────────────────────────────────────
// VOCI — curate a mano, ognuna con la citazione esatta da verificare nel PDF
// scaricato prima di scrivere. Stesso principio di market_rumors: mai una
// riga senza "prova" verificata.
// ─────────────────────────────────────────────────────────────────────────────
const OSMED_2024_URL = 'https://www.aifa.gov.it/documents/20142/3159201/AIFA_Rapporto_OsMed_2024.pdf';
const OSMED_2024_FONTE = 'AIFA · Rapporto OsMed 2024';

const VOCI = [
  {
    fonte: OSMED_2024_FONTE, fonte_url: OSMED_2024_URL, anno: 2024, ambito: 'nazionale',
    indicatore: 'spesa_pubblica_classe_r_apparato_respiratorio', valore: 1753.3, unita: 'mln_eur', pagina: 593,
    descrizione: "I farmaci dell'apparato respiratorio sono la 7ª categoria terapeutica per spesa pubblica nel 2024: 1.753,3 milioni di euro, il 6,3% della spesa pubblica totale, +5,7% sul 2023.",
    prova: "I farmaci dell'apparato respiratorio si confermano anche per il 2024 la settima categoria terapeutica a maggior spesa pubblica, pari a 1.753,3 milioni di euro, corrispondenti al 6,3% della spesa pubblica totale",
  },
  {
    fonte: OSMED_2024_FONTE, fonte_url: OSMED_2024_URL, anno: 2024, ambito: 'nazionale',
    indicatore: 'aderenza_bassa_asma_bpco', valore: 52.2, unita: '%', pagina: 597,
    descrizione: "Il 52,2% degli utilizzatori di farmaci per asma e BPCO mostra bassa aderenza alle terapie (solo il 19,5% è alto-aderente).",
    prova: "Il 52,2% degli utilizzatori ha mostrato una bassa aderenza alle terapie, mentre solo il 19,5% risulta essere alto",
  },
  {
    fonte: OSMED_2024_FONTE, fonte_url: OSMED_2024_URL, anno: 2024, ambito: 'nazionale',
    indicatore: 'aderenza_alta_asma_bpco', valore: 19.5, unita: '%', pagina: 597,
    descrizione: "Solo il 19,5% degli utilizzatori di farmaci per asma e BPCO risulta alto-aderente alla terapia.",
    prova: "Il 52,2% degli utilizzatori ha mostrato una bassa aderenza alle terapie, mentre solo il 19,5% risulta essere alto",
  },
  {
    fonte: OSMED_2024_FONTE, fonte_url: OSMED_2024_URL, anno: 2024, ambito: 'nazionale',
    indicatore: 'quota_consumo_farmaci_equivalenti', valore: 36.1, unita: '%', pagina: 161,
    descrizione: "Nel 2024 i farmaci equivalenti rappresentano il 36,1% dei consumi nazionali (DDD) tra i farmaci a brevetto scaduto.",
    prova: "In lieve aumento la percentuale di utilizzo dei farmaci equivalenti, che nel 2024 è stata pari al 36,1%",
  },
  {
    fonte: OSMED_2024_FONTE, fonte_url: OSMED_2024_URL, anno: 2024, ambito: 'Nord',
    indicatore: 'quota_consumo_farmaci_equivalenti', valore: 45.5, unita: '%', pagina: 161,
    descrizione: "Le Regioni del Nord consumano il 45,5% di farmaci equivalenti, sopra la media nazionale (36,1%).",
    prova: "Le Regioni del Nord consumano una percentuale maggiore di equivalenti (45,5%) rispetto a quelle del Centro (34,2%) e del Sud (25,3%)",
  },
  {
    fonte: OSMED_2024_FONTE, fonte_url: OSMED_2024_URL, anno: 2024, ambito: 'Centro',
    indicatore: 'quota_consumo_farmaci_equivalenti', valore: 34.2, unita: '%', pagina: 161,
    // NOTA 14/09/2026: questo e' il dato reale del Centro (che include il Lazio) — una
    // sintesi esterna aveva attribuito al Lazio specificamente un 20-22%, MAI trovato
    // nel testo del rapporto: quella fascia (19-22%) e' Campania/Calabria/Basilicata/
    // Sicilia, non il Lazio. Nessun dato regionale piu' fine del macro-gruppo Centro
    // e' disponibile in questa sezione del rapporto per il solo Lazio.
    descrizione: "Le Regioni del Centro (incluso il Lazio) consumano il 34,2% di farmaci equivalenti — vicino alla media nazionale (36,1%), non nella fascia 20-22% talvolta citata per il solo Lazio (dato non verificato in questo rapporto).",
    prova: "Le Regioni del Nord consumano una percentuale maggiore di equivalenti (45,5%) rispetto a quelle del Centro (34,2%) e del Sud (25,3%)",
  },
  {
    fonte: OSMED_2024_FONTE, fonte_url: OSMED_2024_URL, anno: 2024, ambito: 'Sud e Isole',
    indicatore: 'quota_consumo_farmaci_equivalenti', valore: 25.3, unita: '%', pagina: 161,
    descrizione: "Le Regioni del Sud e Isole consumano il 25,3% di farmaci equivalenti, sotto la media nazionale (36,1%).",
    prova: "Le Regioni del Nord consumano una percentuale maggiore di equivalenti (45,5%) rispetto a quelle del Centro (34,2%) e del Sud (25,3%)",
  },
];

// Normalizzazione aggressiva (minuscolo, senza accenti, solo alfanumerico+spazi)
// per non far dipendere la verifica dalla resa esatta di virgolette/apostrofi/
// trattini tipografici tra l'estrazione PDF e il testo scritto a mano qui sopra.
function norm(s) {
  return String(s).toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

async function scaricaTestoPdf(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} su ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const parser = new PDFParse({ data: buf });
  const { text } = await parser.getText();
  return text;
}

async function run() {
  const apply = process.argv.includes('--apply');
  console.log(`Benchmark macro annuale — ${apply ? 'SCRIVE' : 'solo misura'}\n`);

  const cacheTesti = new Map(); // fonte_url -> testo normalizzato
  let verificate = 0, scartate = 0, scritte = 0;
  const daScrivere = [];

  for (const voce of VOCI) {
    if (!cacheTesti.has(voce.fonte_url)) {
      console.log(`Scarico ${voce.fonte_url} ...`);
      const testo = await scaricaTestoPdf(voce.fonte_url);
      cacheTesti.set(voce.fonte_url, norm(testo));
    }
    const testoNorm = cacheTesti.get(voce.fonte_url);
    const provaNorm = norm(voce.prova);
    if (!testoNorm.includes(provaNorm)) {
      scartate++;
      console.log(`   ⚠️ SCARTATA "${voce.indicatore}" (${voce.ambito}) — citazione non trovata nel PDF scaricato`);
      continue;
    }
    verificate++;
    console.log(`   ✅ "${voce.indicatore}" (${voce.ambito}) → ${voce.valore}${voce.unita} — citazione verificata (pag. ${voce.pagina})`);
    daScrivere.push({
      fonte: voce.fonte, fonte_url: voce.fonte_url, anno: voce.anno, ambito: voce.ambito,
      indicatore: voce.indicatore, valore: voce.valore, unita: voce.unita,
      descrizione: voce.descrizione, prova: voce.prova, pagina: voce.pagina, inserito_da: 'benchmark-macro-annuale.mjs',
    });
  }

  writeFileSync(new URL('../dati-passate/benchmark-macro-verificati.jsonl', import.meta.url), daScrivere.map((r) => JSON.stringify(r)).join('\n') + '\n');

  if (apply && daScrivere.length) {
    const { error } = await supabase.from('market_benchmarks').upsert(daScrivere, { onConflict: 'fonte,anno,ambito,indicatore' });
    if (error) { console.error('❌ errore scrittura:', error.message); process.exit(1); }
    scritte = daScrivere.length;
  }

  console.log(`\nRiepilogo: ${verificate} verificate, ${scartate} scartate (citazione non trovata).`);
  if (!apply) console.log('solo misura — nessuna scrittura. Rilancia con --apply per salvare.');
  else console.log(`scritte ${scritte} righe su market_benchmarks.`);
}

run().catch((e) => { console.error('❌ ERRORE TOP-LEVEL:', e.message); process.exit(1); });
