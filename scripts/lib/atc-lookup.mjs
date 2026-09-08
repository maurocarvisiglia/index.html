/**
 * Lookup principio attivo -> codice ATC (Anatomical Therapeutic Chemical, OMS)
 * =============================================================================
 * Vive in un modulo suo perche' due script diversi (aifa-registro-prodotti.mjs
 * per i farmaci finiti, principi-attivi-edqm.mjs per le materie prime) devono
 * usare la STESSA normalizzazione — altrimenti "Furosemide" da un file e
 * "furosemide" dall'altro non si incontrano nel lookup.
 *
 * FONTE: la colonna ATC gia' presente nel file AIFA Lista_farmaci_equivalenti.csv
 * (uno dei 3 file gia' scaricati da aifa-registro-prodotti.mjs) — mai letta
 * finora, stesso identico schema di scoperta gia' fatto per il CND dei
 * dispositivi (device_category) e per Classe A/H (regime_farmaco).
 *
 * L'ATC classifica la SOSTANZA CHIMICA, non il canale di vendita: si applica
 * sia ai farmaci finiti (company_products.category='commercializzato') sia
 * alle materie prime EDQM (category='principio_attivo') — verificato il
 * 08/09/2026: Furosemide (prodotta come principio attivo da F.I.S.) ha lo
 * stesso ATC C03CA01 del farmaco finito Furosemide.
 *
 * Copertura parziale per costruzione (non tutti i principi attivi sono nella
 * lista di trasparenza equivalenti — es. farmaci senza concorrenza generica):
 * misurate 385 coppie principio attivo/ATC distinte, 178 classi a 4 livelli.
 */

const URL_EQUIVALENTI = 'https://www.aifa.gov.it/documents/20142/825643/Lista_farmaci_equivalenti.csv';

/**
 * Stessa normalizzazione del trigger SQL sync_product_normalization()
 * (supabase/migrations/20260827180000_company_products.sql): minuscolo,
 * via ogni carattere non alfanumerico. Deve restare identica a quella, e'
 * quella che genera company_products.active_ingredients_norm — un lookup
 * con una normalizzazione diversa non troverebbe mai corrispondenza.
 */
export function normalizzaPrincipioAttivo(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Primi 5 caratteri di un ATC (es. "R03AK07" -> "R03AK"): la classe terapeutica. */
export function classeAtc(atc) {
  return atc ? atc.slice(0, 5) : null;
}

let _cache = null;

/**
 * Scarica il file Equivalenti e costruisce Map(principio_attivo_norm -> ATC).
 * Cache in-process: se un run chiama sia il lookup farmaci sia quello API,
 * il file si scarica una volta sola.
 */
export async function costruisciLookupAtc() {
  if (_cache) return _cache;
  const res = await fetch(URL_EQUIVALENTI);
  if (!res.ok) throw new Error(`download Lista_farmaci_equivalenti.csv per ATC: HTTP ${res.status}`);
  const testo = (await res.text()).replace(/^﻿/, '');
  const righe = testo.split(/\r?\n/).filter(Boolean).map((r) => r.split(';'));
  const header = righe[0];
  const iPrincipio = header.indexOf('Principio attivo');
  const iAtc = header.indexOf('ATC');
  if (iPrincipio < 0 || iAtc < 0) throw new Error('colonne "Principio attivo"/"ATC" non trovate in Lista_farmaci_equivalenti.csv — formato del file cambiato?');

  const mappa = new Map();
  for (const cols of righe.slice(1)) {
    const principio = cols[iPrincipio]?.trim();
    const atc = cols[iAtc]?.trim();
    if (!principio || !atc) continue;
    const chiave = normalizzaPrincipioAttivo(principio);
    if (chiave && !mappa.has(chiave)) mappa.set(chiave, atc);
  }
  _cache = mappa;
  return mappa;
}

/**
 * Dato un array di active_ingredients_norm (colonna gia' calcolata dal
 * trigger su company_products), restituisce il primo ATC trovato nel lookup,
 * o null se nessuno dei principi attivi della riga e' coperto.
 */
export function atcPerIngredientiNorm(ingredientiNorm, mappa) {
  for (const i of ingredientiNorm || []) {
    const atc = mappa.get(i);
    if (atc) return atc;
  }
  return null;
}
