# 📊 Stato Implementazione — Enrichment Agent

**Data:** 2026-08-07  
**Status:** ✅ FASE 1 + FASE 2 Completate

---

## ✅ FASE 1: Schema Supabase — COMPLETATO

| Componente | Status | Note |
|-----------|--------|------|
| **Colonne companies** | ✅ | dipendenti, fatturato_range, aree_terapeutiche, descrizione_aziendale, arricchito_il, completezza_arricchimento |
| **therapeutic_areas_glossary** | ✅ | 16 aree (ONCO, CARDIO, ENDOC, IMMUN, NEURO, ...) |
| **enrichment_queue** | ✅ | Coda aziende + indici per performance |
| **enrichment_log** | ✅ | Audit trail tentativi |
| **company_contacts** | ✅ | Decision makers estratti |
| **RPC functions** | ✅ | enrichment_stats_daily(), get_company_job_frequency() |
| **RLS policies** | ✅ | Read-only per utenti, write-only per service_role |

---

## ✅ FASE 2: Backend Node.js — COMPLETATO

| File | Status | Descrizione |
|------|--------|-------------|
| **package.json** | ✅ | Dipendenze: @supabase/supabase-js, axios, dotenv |
| **enrichment-agent.js** | ✅ | 150+ righe: find page → extract text → structure with LLM → save |
| **.env.example** | ✅ | Template per Supabase + API keys |
| **api/enrichment.js** | ✅ | Vercel Serverless Function |
| **vercel.json** | ✅ | Cron schedule: `0 2 * * *` (02:00 UTC daily) |
| **ENRICHMENT_SETUP.md** | ✅ | Guida setup locale + deploy Vercel |

---

## 📋 Prossimi Step

### ⏹️ FASE 3: Frontend UI (Giorno 7-8)

**Cosa manca:** Sezione "Dati Arricchiti Automaticamente" in company-detail

**File da modificare:** `index.html`

**Componenti da aggiungere:**
- [ ] KPI grid per dati arricchiti (dipendenti, fatturato, TA)
- [ ] Tabella decision_makers
- [ ] Progress bar completeness (0-100%)
- [ ] Timestamp "Ultimo aggiornamento"
- [ ] Status badge (pending/in_progress/completed)

### ⏹️ FASE 4: Test & Validation (Giorno 8-9)

**Checklist:**
- [ ] Setup locale: `npm install` + `.env`
- [ ] Test agente: `node enrichment-agent.js` con azienda test
- [ ] Verifica dati in Supabase (companies, company_contacts, enrichment_log)
- [ ] Deploy Vercel + environment variables
- [ ] Test cron manuale da Vercel dashboard
- [ ] Popola enrichment_queue con 8-10 aziende prioritarie

### ⏹️ FASE 5: Production (Giorno 9+)

**Monitoring:**
- [ ] Dashboard metriche giornaliere (completeness %, API usage, retry rate)
- [ ] Slack alerts su errori sistematici
- [ ] Review accuracy dei dati estratti per 3 giorni
- [ ] Aggiustamento prompt/fallback se necessario

---

## 🚀 Cosa Fare ORA

### 1. Setup Locale (30 min)

```bash
cd "C:\Users\Utente\Downloads\INDEX\LS Intelligence"
npm install
cp .env.example .env
# Edita .env con le tue API keys
```

### 2. Ottieni API Keys (se non le hai)

| API | Free Quota | Link |
|-----|-----------|------|
| Tavily | 1.000 crediti/mese | https://tavily.com |
| Brave Search | 2.000 query/mese | https://api.search.brave.com |
| Groq | 9.000 req/giorno | https://console.groq.com |
| Gemini | 15 req/min | https://ai.google.dev |

### 3. Test Locale

```bash
# Inserisci azienda test in enrichment_queue (da Supabase SQL)
INSERT INTO enrichment_queue (company_id, stato, priorita)
SELECT id, 'pending', 10 FROM companies 
WHERE nome_azienda LIKE '%3B%' LIMIT 1;

# Esegui agente
node enrichment-agent.js

# Verifica risultati in Supabase
SELECT * FROM company_contacts WHERE company_id = '...';
SELECT * FROM enrichment_log ORDER BY timestamp DESC LIMIT 5;
```

### 4. Deploy Vercel

```bash
# Connetti repo GitHub a Vercel
# Aggiungi environment variables
# Verifica cron schedule
```

---

## 📊 Architettura Finale

```
┌─────────────────────────────────────────────────────────┐
│  VERCEL CRON (02:00 UTC ogni giorno)                    │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
            POST /api/enrichment.js
                         │
                         ▼
    ┌───────────────────────────────────┐
    │   enrichment-agent.js             │
    │                                   │
    │  1. Seleziona aziende dalla coda  │
    │  2. Per ogni azienda:             │
    │     a) Find page (Tavily→Brave)  │
    │     b) Extract text (Jina)        │
    │     c) Structure (Groq→Gemini)    │
    │     d) Validate & Save            │
    │  3. Aggiorna queue & log          │
    └──────────────────┬────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │   SUPABASE                  │
         ├─────────────────────────────┤
         │ companies (UPDATE)          │
         │ company_contacts (INSERT)   │
         │ enrichment_queue (UPDATE)   │
         │ enrichment_log (INSERT)     │
         └─────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │   FRONTEND LS Intelligence  │
         │   (index.html — FASE 3)     │
         ├─────────────────────────────┤
         │ Company Detail:             │
         │ - Sezione "Dati Arricchiti" │
         │ - KPI visualizzati          │
         │ - Decision makers mostrati  │
         │ - Progress bar completeness │
         └─────────────────────────────┘
```

---

## 🎯 Metriche di Successo

| Metrica | Target | Come Misurare |
|---------|--------|---------------|
| Aziende/giorno arricchite | 8 | SELECT COUNT(*) FROM enrichment_queue WHERE DATE(updated_at) = TODAY() AND stato = 'completed' |
| Completeness medio | ≥75% | SELECT AVG(completezza_arricchimento) FROM companies WHERE arricchito_il >= NOW() - INTERVAL '1 day' |
| Error rate | <5% | SELECT COUNT(*) FROM enrichment_queue WHERE stato = 'failed' ... / total |
| Tempo medio/azienda | <5 min | SELECT AVG(durata_secondi) FROM enrichment_log WHERE DATE(timestamp) = TODAY() |
| API cost | €0 | Tutti free tier ✅ |
| Decision makers identificati | ≥60% aziende | SELECT COUNT(DISTINCT company_id) FROM company_contacts ... |

---

## 📝 Comandi Utili

```bash
# Test locale
node enrichment-agent.js

# Verifica dipendenze
npm list

# Aggiorna dipendenze
npm update

# Visualizza log Vercel
vercel logs

# Trigger cron manuale (da Vercel dashboard)
# Settings → Crons → Test

# Query monitoring
# Esegui nel SQL Editor di Supabase le query in ENRICHMENT_SETUP.md
```

---

## 🔐 Sicurezza

✅ **RLS policies** — utenti non possono modificare dati enriched  
✅ **Service role key** — solo backend può scrivere  
✅ **Email validation** — regex constraint su company_contacts  
✅ **Error logging** — ogni fallimento tracciato in enrichment_log  
✅ **Exponential backoff** — retry smart (1h→6h→24h→48h→72h)  

---

**Dimmi quando hai completato il setup locale e il test passa! Poi procediamo con FASE 3 (UI Frontend). 🚀**
