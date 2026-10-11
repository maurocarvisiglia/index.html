// Vercel Serverless Function for scheduled Market Radar → LS Intelligence sync

import { runMarketRadarSyncDailyBatch } from '../scripts/sync-market-radar.mjs';

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
    console.log('🚀 Avvio sync Market Radar da Vercel Cron...');
    const result = await runMarketRadarSyncDailyBatch(true);
    res.status(200).json({ message: 'Sync Market Radar completata', timestamp: new Date().toISOString(), ...result });
  } catch (error) {
    console.error('❌ Errore sync Market Radar:', error.message);
    res.status(500).json({ error: error.message });
  }
}
