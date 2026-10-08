// Vercel Serverless Function: proxy verso Gemini per le chiamate AI del client (index.html).
// La chiave sta SOLO nella variabile d'ambiente GEMINI_API_KEY di Vercel: fino all'08/10/2026
// era scritta nel sorgente della pagina, visibile a chiunque la aprisse, e si e' bruciata.

export const config = { maxDuration: 60 };

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY non configurata su questo deployment' });

  const { prompt, maxTokens, temperature } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt mancante' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const r = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: String(prompt) }] }],
        generationConfig: { maxOutputTokens: Math.min(Number(maxTokens) || 800, 8000), temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.1 },
      }),
    });
    clearTimeout(timer);
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      return res.status(r.status === 429 || r.status === 503 ? r.status : 502).json({ error: body?.error?.message || `Gemini HTTP ${r.status}` });
    }
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return res.status(502).json({ error: 'Gemini: risposta vuota' });
    return res.status(200).json({ text: text.trim() });
  } catch (e) {
    clearTimeout(timer);
    return res.status(502).json({ error: 'Gemini: ' + (/abort/i.test(String(e.message)) ? 'timeout' : e.message) });
  }
}
