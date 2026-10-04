// Vercel Cron: segnali da sperimentazione clinica (ClinicalTrials.gov), 50 aziende a notte in ordine alfabetico.
// Vercel invoca i cron in GET. Piu' invocazioni ravvicinate sono volute: ciascuna si ferma al budget di tempo
// e la quota giornaliera (50) e' calcolata sul registro, quindi le successive riprendono senza superarla.

import { runTrialSignalsDailyBatch } from '../scripts/trial-signals-giornaliero.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const segreto = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
  if (segreto && req.headers['authorization'] !== `Bearer ${segreto}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { dettagli, ...riepilogo } = await runTrialSignalsDailyBatch({ n: 50, apply: true, timeBudgetMs: 48000 });
    res.status(200).json({ message: 'Segnali sperimentazione clinica completati', timestamp: new Date().toISOString(), ...riepilogo });
  } catch (error) {
    console.error('Errore segnali sperimentazione clinica:', error.message);
    res.status(500).json({ error: error.message });
  }
}
