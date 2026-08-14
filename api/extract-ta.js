// Vercel Serverless Function for scheduled therapeutic-area extraction (Gemini)

import { runTaExtractionDailyBatch } from '../extract-ta-agent.js';

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
    console.log('🚀 Avvio estrazione aree terapeutiche da Vercel Cron...');
    const result = await runTaExtractionDailyBatch();
    res.status(200).json({ message: 'Estrazione TA completata', timestamp: new Date().toISOString(), ...result });
  } catch (error) {
    console.error('❌ Errore estrazione TA:', error.message);
    res.status(500).json({ error: error.message });
  }
}
