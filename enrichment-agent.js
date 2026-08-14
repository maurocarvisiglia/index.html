#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// ════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════

const SB_URL = process.env.SUPABASE_URL || 'https://ehrayeltqottgvkzvbdk.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TAVILY_KEY = process.env.TAVILY_API_KEY;
const BRAVE_KEY = process.env.BRAVE_SEARCH_API_KEY;
const TOGETHER_KEY = process.env.TOGETHER_API_KEY;
const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;

if (!SB_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY non configurato');
  process.exit(1);
}

const supabase = createClient(SB_URL, SB_KEY);

// ════════════════════════════════════════════════════════════
// LOGGER + RETRY HELPER
// ════════════════════════════════════════════════════════════

const log = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
};

// Retry helper con exponential backoff
async function retryWithBackoff(fn, maxRetries = 3, initialDelayMs = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      log.warn(`Retry ${attempt + 1}/${maxRetries - 1} in ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// ════════════════════════════════════════════════════════════
// FASE 1: SELEZIONA AZIENDE DALLA CODA
// ════════════════════════════════════════════════════════════

async function selectCompaniesFromQueue(limitDaily = 8) {
  log.info(`Selezionando aziende dalla coda (limite: ${limitDaily})...`);

  const { data, error } = await supabase
    .from('enrichment_queue')
    .select('*, companies(id, name, website)')
    .eq('stato', 'pending')
    .lte('prossimo_tentativo_il', new Date().toISOString())
    .order('priorita', { ascending: false })
    .limit(limitDaily);

  if (error) {
    log.error(`DB fetch fallito: ${error.message}`);
    throw error;
  }

  log.info(`📋 Trovate ${data.length} aziende per arricchimento (limite: ${limitDaily})`);
  return data;
}

// ════════════════════════════════════════════════════════════
// FASE 2: LOOP PRINCIPALE — PER OGNI AZIENDA
// ════════════════════════════════════════════════════════════

async function enrichCompany(queueRecord) {
  const { id: queue_id, company_id, tentativo_numero } = queueRecord;
  const company = queueRecord.companies;

  log.info(`🚀 [${tentativo_numero + 1}/5] Arricchimento: ${company.name}`);

  // Marca come in_progress
  await supabase
    .from('enrichment_queue')
    .update({ stato: 'in_progress' })
    .eq('id', queue_id);

  try {
    // STEP A: Trova pagina aziendale
    const pageUrl = await findCompanyPage(company);
    log.info(`📍 URL trovato: ${pageUrl.substring(0, 60)}...`);

    // STEP B: Estrai testo
    const pageText = await extractPageText(pageUrl);
    log.info(`📄 Estratti ${pageText.length} caratteri`);

    // STEP C: Struttura dati con LLM
    const extractedData = await structureDataWithLLM(pageText, company);
    log.info(`🧠 Dati strutturati (${extractedData.llm_used})`);

    // STEP D: Valida e salva
    await validateAndSaveData(company_id, extractedData);

    // STEP E: Aggiorna coda come completed
    await supabase
      .from('enrichment_queue')
      .update({
        stato: 'completed',
        arricchito_il: new Date().toISOString(),
      })
      .eq('id', queue_id);

    log.success(`${company.name}`);
  } catch (error) {
    log.error(`${company.name}: ${error.message}`);

    // Exponential backoff: 1h → 6h → 24h → 48h → 72h
    const backoffHours = [1, 6, 24, 48, 72];
    const nextHours = backoffHours[Math.min(tentativo_numero, 4)];
    const nextDate = new Date(Date.now() + nextHours * 3600000);

    await supabase
      .from('enrichment_queue')
      .update({
        stato: 'pending',
        tentativo_numero: tentativo_numero + 1,
        prossimo_tentativo_il: nextDate.toISOString(),
        errore_ultimo: error.message,
      })
      .eq('id', queue_id);
  }
}

// ════════════════════════════════════════════════════════════
// FASE 3: STEP A — TROVA PAGINA AZIENDALE
// ════════════════════════════════════════════════════════════

async function findCompanyPage(company) {
  const { name, website } = company;

  if (website && website.includes('.')) {
    log.info(`📍 Usando sito conosciuto: ${website}`);
    return website;
  }

  // PORTA 1: TAVILY con retry
  if (TAVILY_KEY) {
    try {
      log.info('🔍 Tavily: ricerca pagina azienda...');
      const res = await retryWithBackoff(async () => {
        return await axios.post(
          'https://api.tavily.com/search',
          {
            api_key: TAVILY_KEY,
            query: `${name} pharma about company site:.it`,
            include_answer: false,
            max_results: 5,
          },
          { timeout: 10000 }
        );
      }, 2);

      if (res.data.results?.length > 0) {
        const url = res.data.results[0].url;
        log.success(`Tavily trovato: ${url}`);
        return url;
      }
    } catch (e) {
      log.warn(`Tavily errore: ${e.message}`);
    }
  }

  // PORTA 2: BRAVE SEARCH (fallback) con retry
  if (BRAVE_KEY) {
    try {
      log.info('🔍 Brave: ricerca pagina azienda (fallback)...');
      const res = await retryWithBackoff(async () => {
        return await axios.get('https://api.search.brave.com/res/v1/web/search', {
          headers: { 'X-Subscription-Token': BRAVE_KEY },
          params: {
            q: `${name} about company site:.it`,
            count: 5,
          },
          timeout: 10000,
        });
      }, 2);

      if (res.data.web?.results?.length > 0) {
        const url = res.data.web.results[0].url;
        log.success(`Brave trovato: ${url}`);
        return url;
      }
    } catch (e) {
      log.warn(`Brave errore: ${e.message}`);
    }
  }

  // PORTA 3: LinkedIn fallback con retry
  if (BRAVE_KEY) {
    try {
      log.info('🔍 LinkedIn fallback...');
      const res = await retryWithBackoff(async () => {
        return await axios.get('https://api.search.brave.com/res/v1/web/search', {
          headers: { 'X-Subscription-Token': BRAVE_KEY },
          params: {
            q: `${name} site:linkedin.com/company`,
            count: 3,
          },
          timeout: 10000,
        });
      }, 2);

      if (res.data.web?.results?.length > 0) {
        const url = res.data.web.results[0].url;
        log.success(`LinkedIn trovato: ${url}`);
        return url;
      }
    } catch (e) {
      log.warn(`LinkedIn errore: ${e.message}`);
    }
  }

  throw new Error(`❌ Nessuna pagina trovata per ${name}`);
}

// ════════════════════════════════════════════════════════════
// FASE 4: STEP B — ESTRAI TESTO DALLA PAGINA
// ════════════════════════════════════════════════════════════

async function extractPageText(url) {
  log.info(`📄 Estrazione testo da: ${url.substring(0, 60)}...`);

  // PORTA 1: Jina Reader con retry
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await retryWithBackoff(async () => {
      return await axios.get(jinaUrl, {
        headers: { Accept: 'application/json' },
        timeout: 15000,
      });
    }, 2);

    const markdown = response.data.data?.content || response.data.content;

    if (!markdown || markdown.length < 100) {
      throw new Error('Contenuto estratto troppo breve');
    }

    log.success(`Jina estratti ${markdown.length} caratteri`);
    return markdown;
  } catch (error) {
    log.warn(`⚠️  Jina estrazione fallita: ${error.message}`);
  }

  // PORTA 2: Firecrawl fallback con retry
  if (FIRECRAWL_KEY) {
    try {
      log.info('🔥 Firecrawl: estrazione testo (fallback)...');
      const response = await retryWithBackoff(async () => {
        return await axios.post('https://api.firecrawl.dev/v0/scrape', {
          url: url,
          formats: ['markdown'],
        }, {
          headers: { Authorization: `Bearer ${FIRECRAWL_KEY}` },
          timeout: 30000,
        });
      }, 2);

      const markdown = response.data.markdown;

      if (!markdown || markdown.length < 100) {
        throw new Error('Contenuto estratto troppo breve');
      }

      log.success(`Firecrawl estratti ${markdown.length} caratteri`);
      return markdown;
    } catch (error) {
      log.warn(`⚠️  Firecrawl fallito: ${error.message}`);
    }
  }

  throw new Error(`❌ Estrazione testo fallita per ${url}`);
}

// ════════════════════════════════════════════════════════════
// FASE 5: STEP C — STRUTTURA DATI CON LLM
// ════════════════════════════════════════════════════════════

async function structureDataWithLLM(pageText, company) {
  const prompt = `Tu sei un esperto di valutazione aziendale nel settore Life Sciences italiano.
Leggi questo testo estratto dal sito di una pharma/medtech e estrai SOLO ciò che è esplicitamente scritto.
Non inventare niente. Se un dato non è presente, lascia vuoto (null).

AZIENDA: ${company.name}
TESTO:
${pageText.substring(0, 8000)}

STRUTTURA DI RISPOSTA (JSON STRETTO):
{
  "dipendenti": <numero intero oppure null>,
  "fatturato_range": "<5M | 5-20M | 20-100M | 100-250M | 250-500M | >500M> o null",
  "aree_terapeutiche": ["ONCO", "CARDIO", ...] o [],
  "descrizione_aziendale": "cosa fa, portfolio, specialità",
  "decision_makers": [
    {
      "nome": "Nome Cognome o null",
      "ruolo": "HR Manager / CEO / Chief Medical Officer / ecc",
      "email": "email@example.com o null",
      "telefono": "+39 xxx oppure null",
      "linkedin_url": "https://linkedin.com/in/... o null",
      "fonte": "sito ufficiale / pagina carriere / leadership / news"
    }
  ]
}

ISTRUZIONI CRITICHE:
1. Dipendenti: accetta solo numeri espliciti ("250 dipendenti"). Non inferire da budget.
2. Fatturato: estrai range SOLO se il testo lo dice ("fatturato 2024: €15M"). Se vedi "revenues", è fatturato.
3. Aree terapeutiche: cerca parole come "oncologia", "cardiologia", "diabete". Mappo su ONCO, CARDIO, ENDOC, IMMUN, NEURO, GASTRO, RHEUM, DERM, INFECT, RARE, PEDIATRICS, PATHOLOGY, ecc.
4. Descrizione: breve paragrafo ("Produce farmaci per oncologia e immunologia. Portfolio: [prodotti]").
5. Decision makers: cerca "Chi siamo", "Leadership", "Team", "Contatti", "Carriere". Almeno nome o email. Email valida.
6. JSON VALIDO: il tuo output DEVE essere JSON parsing-valido. Se non sei sicuro, usa null.

Ritorna SOLO il JSON, niente altro.`;

  // PORTA 1: Together AI con retry
  if (!TOGETHER_KEY) {
    throw new Error('TOGETHER_API_KEY non configurata: impossibile strutturare i dati');
  }

  try {
    log.info('🧠 Together AI: strutturazione dati...');
    const response = await retryWithBackoff(async () => {
      return await axios.post(
        'https://api.together.xyz/v1/chat/completions',
        {
          model: 'meta-llama/Llama-3.1-8b-instruct-turbo',
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: 'Sei un data extraction agent. Ritorna SOLO JSON valido, niente altro.',
            },
            { role: 'user', content: prompt },
          ],
        },
        {
          headers: { Authorization: `Bearer ${TOGETHER_KEY}` },
          timeout: 30000,
        }
      );
    }, 2);

    const jsonStr = response.data.choices[0].message.content;
    const parsed = JSON.parse(jsonStr);
    log.success(`Together AI strutturato`);
    return { ...parsed, llm_used: 'together' };
  } catch (e) {
    const reason = e.response?.status
      ? `HTTP ${e.response.status} ${JSON.stringify(e.response.data)}`
      : e.message;
    // Non salviamo mai uno schema vuoto come se fosse un risultato valido:
    // un fallimento della strutturazione LLM deve propagarsi come errore
    // e finire nel normale ciclo di retry/backoff della coda, altrimenti
    // l'azienda viene marcata "completed" con dati tutti null (vedi bug
    // storico: 11 aziende salvate come arricchite al 0% di completezza).
    throw new Error(`Strutturazione dati LLM fallita: ${reason}`);
  }
}

// ════════════════════════════════════════════════════════════
// FASE 6: STEP D — VALIDA E SALVA
// ════════════════════════════════════════════════════════════

async function validateAndSaveData(company_id, extractedData) {
  let { dipendenti, fatturato_range, aree_terapeutiche, descrizione_aziendale, decision_makers, llm_used } = extractedData;

  // Validazione dipendenti
  if (dipendenti !== null && (typeof dipendenti !== 'number' || dipendenti < 0 || dipendenti > 1000000)) {
    log.warn(`⚠️  Dipendenti invalidi: ${dipendenti}, setting to null`);
    dipendenti = null;
  }

  // Validazione fatturato_range
  const validRanges = ['<5M', '5-20M', '20-100M', '100-250M', '250-500M', '>500M'];
  if (fatturato_range && !validRanges.includes(fatturato_range)) {
    log.warn(`⚠️  Fatturato range invalido: ${fatturato_range}, setting to null`);
    fatturato_range = null;
  }

  // Validazione TA (tassonomia reale usata dall'app, non il vecchio glossario abbandonato)
  const { data: validTA } = await supabase
    .from('therapeutic_areas')
    .select('code');
  const validTACodes = validTA.map((t) => t.code);
  const filteredTA = (aree_terapeutiche || []).filter((ta) => validTACodes.includes(ta));

  if (filteredTA.length !== (aree_terapeutiche || []).length) {
    log.warn(`⚠️  Alcuni TA codes invalidi, filtrati a: ${filteredTA}`);
  }

  // Validazione decision_makers
  const cleanDMs = (decision_makers || []).filter((dm) => {
    if (!dm.nome && !dm.email) return false;
    if (dm.email && !dm.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return false;
    return true;
  });

  // Calcola completeness
  let completeness = 0;
  if (dipendenti !== null) completeness += 20;
  if (fatturato_range !== null) completeness += 20;
  if (filteredTA.length > 0) completeness += 20;
  if (descrizione_aziendale && descrizione_aziendale.length > 20) completeness += 20;
  if (cleanDMs.length > 0) completeness += 20;

  // SALVA in companies
  log.info(`💾 Salvataggio: dipendenti=${dipendenti}, completeness=${completeness}%`);

  const { error: updateError } = await supabase
    .from('companies')
    .update({
      dipendenti,
      fatturato_range,
      aree_terapeutiche: filteredTA,
      descrizione_aziendale: descrizione_aziendale || null,
      arricchito_il: new Date().toISOString(),
      completezza_arricchimento: completeness,
    })
    .eq('id', company_id);

  if (updateError) throw updateError;

  // SALVA decision_makers
  await supabase.from('company_contacts').delete().eq('company_id', company_id);

  if (cleanDMs.length > 0) {
    const { error: insertError } = await supabase.from('company_contacts').insert(
      cleanDMs.map((dm) => ({
        company_id,
        nome: dm.nome || null,
        ruolo: dm.ruolo || null,
        email: dm.email || null,
        telefono: dm.telefono || null,
        linkedin_url: dm.linkedin_url || null,
        fonte_scoperta: dm.fonte || 'web',
        verificato: false,
        estratto_il: new Date().toISOString(),
      }))
    );

    if (insertError) throw insertError;
    log.info(`✅ Salvati ${cleanDMs.length} decision makers`);
  }

  // LOG in enrichment_log
  await supabase.from('enrichment_log').insert({
    company_id,
    timestamp: new Date().toISOString(),
    api_usata: llm_used,
    risultato_grezzo: extractedData,
    parsing_riuscito: true,
    campi_estratti: {
      dipendenti: extractedData.dipendenti,
      fatturato_range: extractedData.fatturato_range,
      aree_terapeutiche: filteredTA,
      decision_makers_count: cleanDMs.length,
    },
  });
}

// ════════════════════════════════════════════════════════════
// MAIN — LOOP GIORNALIERO
// ════════════════════════════════════════════════════════════

async function runDailyEnrichment() {
  console.log('\n' + '='.repeat(60));
  console.log('🌅 ENRICHMENT AUTONOMO - ' + new Date().toISOString());
  console.log('='.repeat(60));

  try {
    const companies = await selectCompaniesFromQueue(8);

    if (companies.length === 0) {
      log.success('Coda vuota o tutte in attesa retry. Uscita.');
      return;
    }

    for (const company of companies) {
      try {
        await enrichCompany(company);
      } catch (e) {
        log.error(`Errore elaborazione: ${e.message}`);
      }

      // Rate limiting
      await new Promise((r) => setTimeout(r, 3000));
    }

    console.log('\n' + '='.repeat(60));
    log.success('RUN GIORNALIERO COMPLETATO');
    console.log('='.repeat(60));
  } catch (error) {
    log.error(`ERRORE CRITICO: ${error.message}`);
    process.exit(1);
  }
}

// ════════════════════════════════════════════════════════════
// EXPORT per Vercel + RUN se locale
// ════════════════════════════════════════════════════════════

export { runDailyEnrichment };

// Se eseguito direttamente (node enrichment-agent.js)
const isCLI = process.argv[1] && process.argv[1].includes('enrichment-agent.js');
if (isCLI) {
  console.log('🚀 Avviando runDailyEnrichment()...');
  (async () => {
    await runDailyEnrichment();
  })().catch(e => {
    log.error(`ERRORE TOP-LEVEL: ${e.message}`);
    process.exit(1);
  });
}
