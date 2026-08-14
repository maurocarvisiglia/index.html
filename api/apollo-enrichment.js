// Vercel Serverless Function for scheduled Apollo.io enrichment

import { runApolloDailyBatch } from '../apollo-enrichment-agent.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers['authorization'];
  if (process.env.VERCEL_CRON_SECRET && token !== `Bearer ${process.env.VERCEL_CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🚀 Avvio Apollo enrichment da Vercel Cron...');
    const result = await runApolloDailyBatch();
    res.status(200).json({ message: 'Apollo enrichment completato', timestamp: new Date().toISOString(), ...result });
  } catch (error) {
    console.error('❌ Errore Apollo enrichment:', error.message);
    res.status(500).json({ error: error.message });
  }
}
