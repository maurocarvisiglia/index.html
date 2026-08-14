import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const SOURCE = 'gemini_translate_desc';
const DAILY_LIMIT = Number(process.env.TRANSLATE_DAILY_LIMIT || 15);

if (!GEMINI_KEY) {
  console.error('❌ GEMINI_API_KEY non trovata');
  process.exit(1);
}

function isDailyQuotaExhausted(e) {
  const fullError = JSON.stringify(e.response?.data?.error || {});
  return e.response?.status === 429 && /PerDay/i.test(fullError);
}

async function retryWithBackoff(fn, maxRetries = 2, initialDelayMs = 2000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (isDailyQuotaExhausted(e)) throw e;
      const status = e.response?.status;
      const retriable = status === 429 || status === 503 || e.code === 'ECONNABORTED';
      if (!retriable || attempt === maxRetries - 1) throw e;
      await new Promise(r => setTimeout(r, initialDelayMs * Math.pow(2, attempt)));
    }
  }
}

async function translate(text) {
  const res = await retryWithBackoff(() => axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_KEY}`,
    { contents: [{ parts: [{ text: `Traduci in italiano corrente questo testo aziendale, senza aggiungere o omettere informazioni. Rispondi SOLO con la traduzione, niente altro.\n\nTESTO:\n"""${text}"""` }] }] },
    { timeout: 12000 }
  ));
  return res.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

// Testo con almeno una parola inglese comune tipica delle descrizioni Apollo — non
// perfetto ma sufficiente per evitare di ritradurre testi gia' in italiano.
function looksEnglish(text) {
  return /\b(is a|is an|based in|company|founded|employees|provides|offers|specializ)\b/i.test(text);
}

async function run() {
  console.log('🌐 TRADUZIONE DESCRIZIONI AZIENDALI (retroattiva)\n');
  console.log('═'.repeat(90));

  const { data: doneRows } = await supabase.from('enrichment_log').select('company_id').eq('api_usata', SOURCE);
  const doneIds = new Set(doneRows.map(r => r.company_id));

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, descrizione_aziendale')
    .not('descrizione_aziendale', 'is', null);

  const candidates = companies.filter(c => !doneIds.has(c.id) && looksEnglish(c.descrizione_aziendale));
  const todo = candidates.slice(0, DAILY_LIMIT);
  console.log(`Descrizioni in inglese da tradurre: ${candidates.length} | oggi: ${todo.length}\n`);

  let translated = 0, errors = 0, quotaExhausted = false;
  for (const c of todo) {
    try {
      const it = await translate(c.descrizione_aziendale);
      if (it) {
        await supabase.from('companies').update({ descrizione_aziendale: it }).eq('id', c.id);
        translated++;
        console.log(`   ✅ "${c.name}"`);
      }
      await supabase.from('enrichment_log').insert({
        company_id: c.id,
        timestamp: new Date().toISOString(),
        api_usata: SOURCE,
        parsing_riuscito: true,
        campi_estratti: { tradotto: !!it },
      });
    } catch (e) {
      if (isDailyQuotaExhausted(e)) {
        quotaExhausted = true;
        console.log('\n🛑 Quota giornaliera esaurita — riprenderà al prossimo run.');
        break;
      }
      errors++;
      console.log(`   ❌ "${c.name}" — errore: ${e.response?.status || ''} ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 4000));
  }

  console.log('\n' + '═'.repeat(90));
  console.log(`📊 RISULTATO: ${translated} tradotte | ${errors} errori | quota esaurita: ${quotaExhausted} | ancora da fare: ${candidates.length - translated - errors}`);
}
run();
