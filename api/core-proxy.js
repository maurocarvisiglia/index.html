// Vercel Serverless Function — proxy verso il gateway CORE per le chiamate AI
// generiche del client (index.html). Esiste perché CORE_INTERNAL_KEY non deve
// MAI arrivare al browser (a differenza di Mistral/Gemini/Groq, già esposte
// nel sorgente client per scelte precedenti — qui non si ripete l'errore).
//
// Usato come ULTIMA rete di sicurezza nella cascata callAI/callAIPowerful: se
// Mistral, Gemini e Groq falliscono tutti insieme (successo il 04/09/2026 —
// quota Mistral esaurita da un test, Gemini in timeout, Groq con chiave morta
// da prima), questo endpoint pesca dai worker gratuiti di CORE
// (policy.max_cost='free': openrouter/free, GLM 5.2 free, Gemma 4 31B free),
// diversi dai tre sopra e quindi non soggetti allo stesso esaurimento.

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const CORE_URL = process.env.CORE_URL;
  const CORE_KEY = process.env.CORE_INTERNAL_KEY;
  if (!CORE_KEY || !CORE_URL) {
    return res.status(500).json({ error: 'CORE non configurato su questo deployment' });
  }

  const { prompt, system, maxTokens } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'prompt mancante' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const r = await fetch(CORE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-core-key': CORE_KEY },
      signal: controller.signal,
      body: JSON.stringify({
        capability: 'writing',
        prompt,
        system: system || undefined,
        policy: { max_cost: 'free' },
        max_tokens: Math.min(Number(maxTokens) || 800, 4000),
        meta: { project_id: 'LS_JOB_INTELLIGENCE', task_id: 'client-fallback' },
      }),
    });
    clearTimeout(timer);
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      return res.status(r.status === 402 ? 503 : 502).json({ error: body?.error || `CORE HTTP ${r.status}` });
    }
    // I worker gratuiti (auto-router OpenRouter) a volte espongono il
    // "ragionamento" grezzo prima della risposta vera — se dentro c'e' un
    // blocco JSON (il caso che romperebbe il parsing lato client), isola
    // quello; altrimenti lascia il testo intero (i casi di sola prosa se la
    // cavano comunque meglio con un po' di rumore che con un errore totale).
    let text = String(body?.text ?? '').trim();
    const inizio = text.indexOf('{'), fine = text.lastIndexOf('}');
    if (inizio !== -1 && fine > inizio) text = text.slice(inizio, fine + 1);
    return res.status(200).json({ text, worker: body?.worker_used || 'core' });
  } catch (e) {
    clearTimeout(timer);
    const msg = /abort/i.test(String(e.message)) ? 'timeout' : e.message;
    return res.status(502).json({ error: 'CORE: ' + msg });
  }
}
