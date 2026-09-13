// Vercel Serverless Function for scheduled Market Rumors ingestion

import { runMarketRumorsDailyBatch } from '../scripts/market-rumors-giornaliero.mjs';

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
    console.log('🚀 Avvio Market Rumors da Vercel Cron...');
    const result = await runMarketRumorsDailyBatch({ apply: true });
    res.status(200).json({ message: 'Market Rumors completato', timestamp: new Date().toISOString(), ...result });
  } catch (error) {
    console.error('❌ Errore Market Rumors:', error.message);
    res.status(500).json({ error: error.message });
  }
}
