#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const SOURCE = 'gemini_ta_extraction';
// Piano gratuito Gemini: 20 richieste/giorno per questo progetto+modello. Tetto basso
// (non solo per la quota Gemini, ma perche' la funzione serverless Vercel ha un limite
// di durata: 8 aziende * ~4s di pausa gia' arrivano vicino al bordo, con margine per
// eventuali retry non si puo' salire senza rischiare FUNCTION_INVOCATION_TIMEOUT).
const DAILY_LIMIT = Number(process.env.TA_DAILY_LIMIT || 8);

function isDailyQuotaExhausted(e) {
  // La sottostringa "PerDay" sta dentro error.details[].violations[].quotaId,
  // non in error.message — bisogna guardare l'intero oggetto errore, non solo il messaggio.
  const fullError = JSON.stringify(e.response?.data?.error || {});
  return e.response?.status === 429 && /PerDay/i.test(fullError);
}

async function retryWithBackoff(fn, maxRetries = 2, initialDelayMs = 2000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (isDailyQuotaExhausted(e)) throw e; // niente da fare finche' non passa la giornata
      const status = e.response?.status;
      const retriable = status === 429 || status === 503 || e.code === 'ECONNABORTED';
      if (!retriable || attempt === maxRetries - 1) throw e;
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function extractTA(description, validCodes) {
  const prompt = `Leggi questa descrizione aziendale e individua SOLO le aree terapeutiche esplicitamente menzionate (anche come sinonimo chiaro, es. "cancro" = oncology).
Usa SOLO codici da questa lista, nessun altro: ${validCodes.join(', ')}
Non inferire, non indovinare: se un'area non e' esplicitamente nel testo, non includerla.
Se il testo non menziona nessuna area terapeutica riconoscibile, rispondi con un array vuoto.

DESCRIZIONE:
"""${description.slice(0, 2000)}"""

Rispondi SOLO con un array JSON di stringhe, es. ["oncology","immunology"] oppure [].`;

  const res = await retryWithBackoff(() => axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`,
    { contents: [{ parts: [{ text: prompt }] }] },
    { timeout: 12000 }
  ));
  const raw = res.data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const clean = raw.replace(/```json|```/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(code => validCodes.includes(code));
}

async function runTaExtractionDailyBatch() {
  const log = [];
  const push = (msg) => { console.log(msg); log.push(msg); };

  if (!GEMINI_KEY) {
    throw new Error('GEMINI_API_KEY non configurata');
  }

  push('🔬 ESTRAZIONE AREE TERAPEUTICHE — ' + new Date().toISOString());

  const { data: taRows } = await supabase.from('therapeutic_areas').select('code');
  const validCodes = taRows.map(t => t.code);

  const { data: doneRows } = await supabase.from('enrichment_log').select('company_id').eq('api_usata', SOURCE);
  const doneIds = new Set(doneRows.map(r => r.company_id));

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, descrizione_aziendale')
    .not('descrizione_aziendale', 'is', null);

  const remaining = companies.filter(c => !doneIds.has(c.id));
  const todo = remaining.slice(0, DAILY_LIMIT);
  push(`Rimanenti totali: ${remaining.length} | in questo batch: ${todo.length}`);

  let extracted = 0, empty = 0, errors = 0, quotaExhausted = false;
  for (const c of todo) {
    try {
      const codes = await extractTA(c.descrizione_aziendale, validCodes);
      if (codes.length) {
        await supabase.from('companies').update({ aree_terapeutiche: codes }).eq('id', c.id);
        extracted++;
        push(`   ✅ "${c.name}" → ${codes.join(', ')}`);
      } else {
        empty++;
        push(`   ⬜ "${c.name}" — nessuna area esplicita`);
      }
      await supabase.from('enrichment_log').insert({
        company_id: c.id,
        timestamp: new Date().toISOString(),
        api_usata: SOURCE,
        parsing_riuscito: true,
        campi_estratti: { aree_terapeutiche: codes },
      });
    } catch (e) {
      if (isDailyQuotaExhausted(e)) {
        quotaExhausted = true;
        push('🛑 Quota giornaliera Gemini esaurita — riprenderà al prossimo run.');
        break;
      }
      errors++;
      push(`   ❌ "${c.name}" — errore: ${e.response?.status || ''} ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 4000));
  }

  const summary = { attempted: todo.length, extracted, empty, errors, quotaExhausted, stillRemaining: remaining.length - extracted - empty - errors };
  push('📊 RISULTATO: ' + JSON.stringify(summary));
  return { summary, log };
}

export { runTaExtractionDailyBatch };

const isCLI = process.argv[1] && process.argv[1].includes('extract-ta-agent.js');
if (isCLI) {
  runTaExtractionDailyBatch().catch(e => {
    console.error('❌ ERRORE TOP-LEVEL:', e.message);
    process.exit(1);
  });
}
