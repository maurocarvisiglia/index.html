// Vercel Serverless Function per la raccolta Apollo unificata giornaliera —
// sostituisce api/apollo-enrichment.js come endpoint del cron: una sola visita
// per azienda invece di tre script separati sulle stesse aziende (richiesto da
// Mauro il 23/09/2026). Stesso schema di autenticazione/risposta dell'originale.
//
// BINARIO PARALLELO (28/09/2026): la versione con archivio senza perdite e' il
// percorso primario; la versione del 23/09 resta IDENTICA come ripiego
// automatico se la nuova fallisce. APOLLO_UNIFICATO_MODO=legacy inverte i due
// senza toccare il codice. La risposta dice sempre quale percorso ha servito.

import { runUnificatoDailyBatch } from '../scripts/apollo-unificato-giornaliero.mjs';
import { runUnificatoDailyBatchLegacy } from '../scripts/apollo-unificato-giornaliero-legacy.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers['authorization'];
  if (process.env.VERCEL_CRON_SECRET && token !== `Bearer ${process.env.VERCEL_CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const legacyPrimo = process.env.APOLLO_UNIFICATO_MODO === 'legacy';
  const percorsi = legacyPrimo
    ? [['legacy', runUnificatoDailyBatchLegacy], ['archivio', runUnificatoDailyBatch]]
    : [['archivio', runUnificatoDailyBatch], ['legacy', runUnificatoDailyBatchLegacy]];

  const errori = [];
  for (const [nome, esegui] of percorsi) {
    try {
      console.log(`🚀 Avvio Apollo unificato (percorso: ${nome})...`);
      const result = await esegui();
      return res.status(200).json({
        message: 'Apollo unificato completato', percorso: nome,
        ripiego: errori.length > 0, errori_percorso_primario: errori,
        timestamp: new Date().toISOString(), ...result,
      });
    } catch (error) {
      console.error(`❌ Errore Apollo unificato (percorso: ${nome}):`, error.message);
      errori.push({ percorso: nome, errore: error.message });
    }
  }
  res.status(500).json({ error: 'entrambi i percorsi falliti', errori });
}
