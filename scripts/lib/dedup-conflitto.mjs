/**
 * Deduplica sulla chiave di conflitto del database
 * =============================================================================
 * Vive in un modulo suo perche' il collaudo deve esercitare QUESTO codice, non
 * una copia: e' una funzione da tre righe che, sbagliata, ha fatto perdere una
 * passata da 3,44 $ con 725 aree e 1.433 fatti gia' pagati.
 *
 * `ON CONFLICT DO UPDATE` si rifiuta di toccare la stessa riga due volte nello
 * stesso comando (errore 21000). Un modello linguistico restituisce
 * regolarmente la stessa area due volte per la stessa azienda con due citazioni
 * diverse: e' testo generato, non una chiave primaria.
 */

/** company_therapeutic_areas: indice unico su (company_id, code, fonte). */
export const chiaveArea = (r) => `${r.company_id}|${r.code}|${r.fonte}`;

/**
 * company_facts: indice unico su (company_id, tipo, valore_norm), dove
 * valore_norm e' una colonna GENERATA come lower(btrim(valore)). La chiave va
 * calcolata con la stessa normalizzazione, altrimenti "Milano" e "milano"
 * passano il nostro filtro e fanno fallire il comando.
 */
export const chiaveFatto = (r) => `${r.company_id}|${r.tipo}|${String(r.valore).trim().toLowerCase()}`;

/** company_products: indice unico su (company_id, lower(brand_name)). */
export const chiaveProdotto = (r) => `${r.company_id}|${String(r.brand_name).trim().toLowerCase()}`;

/** Tiene la PRIMA occorrenza di ogni chiave: e' quella con la citazione migliore. */
export function unici(righe, chiave) {
  const visti = new Set();
  return righe.filter((r) => {
    const k = chiave(r);
    if (visti.has(k)) return false;
    visti.add(k);
    return true;
  });
}

/**
 * Scrive righe a lotti, in modo che nessun singolo guasto porti via il resto.
 *
 * Vive qui, accanto alla deduplica, perche' e' lo stesso problema: e' l'unico
 * punto del sistema in cui i dati pagati incontrano un vincolo di unicita'. Ne
 * esiste UNA copia, usata da tutti gli script e coperta da
 * tests/scrittura-conflitto.test.mjs.
 *
 *   1  deduplica sulla chiave di conflitto (senza, `ON CONFLICT` da 21000)
 *   2  lotti da 100
 *   3  se un lotto viene rifiutato, riprova riga per riga: si perde la riga
 *      guasta, non le altre 99
 *
 * @param sb       funzione (percorso, init) -> Promise, che parla col database
 * @param risorsa  percorso PostgREST con on_conflict gia' impostato
 * @param righe    righe da scrivere, tutte con lo STESSO insieme di chiavi
 *                 (PostgREST rifiuta lotti con chiavi disomogenee: PGRST102)
 * @param chiave   funzione riga -> stringa, la chiave di conflitto
 * @returns numero di righe effettivamente scritte
 */
export async function scriviLotti(sb, risorsa, righe, chiave, log = console.log) {
  const puliti = unici(righe, chiave);
  if (righe.length - puliti.length) log(`  ${righe.length - puliti.length} righe duplicate nel lotto, unificate`);

  const invia = (corpo) => sb(risorsa, { method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify(corpo) });

  let scritte = 0;
  for (let i = 0; i < puliti.length; i += 100) {
    const lotto = puliti.slice(i, i + 100);
    try {
      await invia(lotto);
      scritte += lotto.length;
    } catch (e) {
      log(`  lotto rifiutato (${String(e.message).slice(0, 70)}) - riprovo riga per riga`);
      for (const r of lotto) {
        try { await invia([r]); scritte++; }
        catch (e2) { log(`    riga scartata: ${String(e2.message).slice(0, 88)}`); }
      }
    }
  }
  return scritte;
}
