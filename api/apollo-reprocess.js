// Vercel Serverless Function: riprocessa un'azienda scartata per mismatch, dopo
// conferma/correzione umana della ragione sociale. Chiamata dal browser (scheda
// aziende -> elenco mismatch), ma usa la service_role e la chiave Apollo lato
// server: la chiave Apollo non va mai esposta al client (a differenza di quella
// Groq, gia' presente nel codice per altri motivi storici).

import { reprocessMismatchedCompany } from '../apollo-enrichment-agent.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { companyId, confirmedRagioneSociale } = req.body || {};
  if (!companyId) {
    return res.status(400).json({ error: 'companyId mancante' });
  }

  try {
    const result = await reprocessMismatchedCompany(companyId, confirmedRagioneSociale || null);
    res.status(200).json({ message: 'Azienda riprocessata con successo', ...result });
  } catch (error) {
    console.error('❌ Errore riprocessamento mismatch:', error.message);
    res.status(500).json({ error: error.message });
  }
}
