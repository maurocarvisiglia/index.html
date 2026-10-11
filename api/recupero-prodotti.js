// Vercel Serverless Function for scheduled product recovery (free tier, official website)

import { runProductRecoveryDailyBatch } from '../scripts/core-prodotti-giornaliero.mjs';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  // Vercel chiama i cron in GET (prima accettavamo solo POST: i cron non partivano mai)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers['authorization'];
  const segreto = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;
  if (segreto && token !== `Bearer ${segreto}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🚀 Avvio recupero prodotti da Vercel Cron...');
    const result = await runProductRecoveryDailyBatch(15, true);
    res.status(200).json({ message: 'Recupero prodotti completato', timestamp: new Date().toISOString(), ...result });
  } catch (error) {
    console.error('❌ Errore recupero prodotti:', error.message);
    res.status(500).json({ error: error.message });
  }
}
