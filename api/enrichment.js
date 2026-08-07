// Vercel Serverless Function for scheduled enrichment

import { runDailyEnrichment } from '../enrichment-agent.js';

export default async function handler(req, res) {
  // Solo POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Opzionale: verifica token per sicurezza
  const token = req.headers['authorization'];
  if (process.env.VERCEL_CRON_SECRET && token !== `Bearer ${process.env.VERCEL_CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('🚀 Avvio enrichment da Vercel Cron...');
    await runDailyEnrichment();
    res.status(200).json({ message: 'Enrichment completato', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('❌ Errore enrichment:', error.message);
    res.status(500).json({ error: error.message });
  }
}
