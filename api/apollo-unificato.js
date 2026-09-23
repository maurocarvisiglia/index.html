// Vercel Serverless Function per la raccolta Apollo unificata giornaliera —
// sostituisce api/apollo-enrichment.js come endpoint del cron: una sola visita
// per azienda invece di tre script separati sulle stesse aziende (richiesto da
// Mauro il 23/09/2026). Stesso schema di autenticazione/risposta dell'originale.

import { runUnificatoDailyBatch } from '../scripts/apollo-unificato-giornaliero.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers['authorization'];
  if (process.env.VERCEL_CRON_SECRET && token !== `Bearer ${process.env.VERCEL_CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🚀 Avvio Apollo unificato da Vercel Cron...');
    const result = await runUnificatoDailyBatch();
    res.status(200).json({ message: 'Apollo unificato completato', timestamp: new Date().toISOString(), ...result });
  } catch (error) {
    console.error('❌ Errore Apollo unificato:', error.message);
    res.status(500).json({ error: error.message });
  }
}
