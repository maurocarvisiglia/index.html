# 🔍 DIAGNOSI LS INTELLIGENCE — Stato Attuale & Roadmap

**Data diagnosi:** 2026-08-07  
**Progetto:** LS Job Intelligence — Life Sciences Market Intelligence Engine  
**Versione HTML:** 712KB (monolitica, SPA pura)

---

## 📊 STATO ATTUALE DEL PROGETTO

### ✅ Cosa Funziona

#### 1. **Frontend SPA** (index.html)
- **9 View principali:**
  - `view-dashboard`: KPI, job trends, market signals
  - `view-listings`: Annunci di lavoro (LS Intelligence + Head Hunter)
  - `view-companies`: Lista aziende con filtri (tipo, status, sort)
  - `view-company-detail`: Profilo aziendale dettagliato
  - `view-signals`: Market intelligence signals
  - `view-ruolo`: Role intelligence (seniority, RAL, aree funzionali)
  - `view-commercial`: Commercial intelligence (decision makers, contacts)
  - `view-role-intel`: Role analytics
  - `view-report`, `view-scarcity`, `view-competitor`, `view-geo`, `view-users`

#### 2. **Modulo Aziende** (già strutturato)
Campi **gestiti manualmente** nel profilo aziendale:
- N. dipendenti (numerico)
- Codice Ateco (testo)
- Settore (dropdown con 18 opzioni predefinite: Pharma, Biotech, Medical Devices, CRO, CDMO, ecc.)
- Descrizione attività (textarea)

Infrastrutture di **supporto automatico**:
- ✅ Ricerca web manuale: incolla testo → estrai dati con IA
- ✅ Arricchimento da Wikidata: usa sito web salvato per disambiguare
- ✅ KPI da annunci raccolti: dipendenti, fatturato, seniority, RAL media
- ✅ AI Summary: genera intelligence aziendale
- ✅ Opportunity Score: calcola priorità di hiring

#### 3. **Connettività Supabase**
- ✅ URL: `https://ehrayeltqottgvkzvbdk.supabase.co`
- ✅ Connessione diretta dal frontend (no backend separato)
- ✅ Tabelle esistenti per job listings, companies, roles, salaries

#### 4. **Git History** (Preparazione)
Lavoro recente sullo schema:
- `321e412`: Riallinea classificazione settore (annunci ↔ aziende)
- `7589070`: **Unifica tassonomia settori + aggiunge scheletro arricchimento**
- `4e841e1`: Profilo azienda arricchito + ricerca web guidata

---

## ❌ Cosa Manca

### 1. **Backend Node.js per Agente Autonomo**
- Nessun file `.js` di backend
- Nessun `package.json`
- Nessun `api/` directory per Vercel functions
- **DEVE essere creato:** enrichment-agent.js

### 2. **Schema Supabase Incompleto**
Tabelle **NON presenti** (verificare in Supabase):
- ❌ `enrichment_queue` — coda aziende in attesa di enrichment
- ❌ `enrichment_log` — audit trail di ogni tentativo
- ❌ `company_contacts` — decision makers (nome, email, tel, LinkedIn, ruolo)
- ❌ `therapeutic_areas_glossary` — mapping codici aree terapeutiche

Campi **MANCANTI nella tabella `companies`:**
- ❌ `dipendenti` (numerico, nullable)
- ❌ `fatturato_range` (enum: <5M | 5-20M | 20-100M | 100-250M | 250-500M | >500M)
- ❌ `aree_terapeutiche` (array di codici: ONCO, CARDIO, IMMUN, ecc.)
- ❌ `descrizione_aziendale` (textarea)
- ❌ `arricchito_il` (timestamp)
- ❌ `completezza_arricchimento` (percentage: 0-100)

### 3. **Configurazione Vercel Cron**
- ❌ `vercel.json` con schedule `0 2 * * *` (02:00 UTC ogni giorno)
- ❌ API endpoint `/api/enrichment` per Vercel Functions

### 4. **API Keys**
Status **SCONOSCIUTO** (verificare):
- ? `TAVILY_API_KEY` (search engine semantica)
- ? `BRAVE_SEARCH_API_KEY` (fallback search)
- ? `GROQ_API_KEY` (LLM primary) — **PRESENTE nel brief** ✅
- ? `GEMINI_API_KEY` (LLM fallback) — **PRESENTE nel brief** ✅
- ? `SUPABASE_SERVICE_ROLE_KEY` (accesso DB con privilegi)

### 5. **UI Frontend**
Nel modulo Company Detail manca:
- ❌ Tab/sezione "Dati Arricchiti Automaticamente"
- ❌ Visualizzazione dei campi estratti automaticamente
- ❌ Progress bar di completeness (0-100%)
- ❌ Tabella decision makers
- ❌ Status enrichment (pending/in_progress/completed)

### 6. **Documentazione & Setup**
- ❌ File `.env.example` con variabili richieste
- ❌ Script SQL di migration per tabelle nuove
- ❌ Guida di setup per developer

---

## 🎯 PRIORITÀ DI IMPLEMENTAZIONE

### **FASE 1: Schema & Infrastruttura (Giorno 1-2)**
1. **Creare tabelle Supabase:**
   - `enrichment_queue` (schema: id, company_id, stato, priorita, tentativo_numero, prossimo_tentativo_il, errore_ultimo, arricchito_il)
   - `enrichment_log` (schema: id, company_id, timestamp, api_usata, risultato_grezzo, parsing_riuscito, campi_estratti)
   - `company_contacts` (schema: id, company_id, nome, ruolo, email, telefono, linkedin_url, fonte_scoperta, verificato, estratto_il)
   - `therapeutic_areas_glossary` (schema: codice, nome_it, descrizione)

2. **Aggiungere colonne a `companies`:**
   - dipendenti (int)
   - fatturato_range (text enum)
   - aree_terapeutiche (text[] array)
   - descrizione_aziendale (text)
   - arricchito_il (timestamp)
   - completezza_arricchimento (int 0-100)

3. **Creare RPC per metriche:**
   - `enrichment_stats_daily()` → stats per monitoring

### **FASE 2: Backend Agent (Giorno 3-5)**
1. Creare struttura progetto:
   - `enrichment-agent.js` (logic del loop)
   - `package.json` con dipendenze (@supabase/supabase-js, axios, dotenv)
   - `.env.example` con variabili

2. Implementare 5 step fondamentali:
   - STEP A: findCompanyPage (Tavily → Brave → LinkedIn)
   - STEP B: extractPageText (Jina → Firecrawl)
   - STEP C: structureDataWithLLM (Groq → Gemini)
   - STEP D: validateAndSaveData (validazione + salvataggio)
   - STEP E: updateQueue (mark as completed/retry)

3. Testare localmente con 3-5 aziende

### **FASE 3: Vercel Deploy (Giorno 5-6)**
1. Creare `api/enrichment.js` (Vercel Function)
2. Configurare `vercel.json` con cron schedule
3. Test: eseguire manualmente trigger

### **FASE 4: Frontend UI (Giorno 6-7)**
1. Aggiungere sezione "Dati Arricchiti" nel company-detail
2. Mostrare campi: dipendenti, fatturato, TA, descrizione, decision makers
3. Progress bar completeness
4. Tooltip con data/ora ultimo aggiornamento

### **FASE 5: Monitoring & Refinement (Ongoing)**
1. Dashboard metriche enrichment (completeness %, API usage, retry rate)
2. Alert su errori sistematici
3. Aggiustamento prompt/fallback basato su accuracy

---

## 🔧 PRIMI PASSI (Prossime 2 Ore)

### **Task 1: Verifica Schema Supabase**
```bash
# Login a https://app.supabase.com
# Naviga a progetto ID: ehrayeltqottgvkzvbdk
# Verifica:
# - Tabelle esistenti: companies, job_listings, roles, salaries, ecc.
# - Colonne in `companies`: id, nome_azienda, sito_web, tipo, stato, ateco, settore, descrizione, ...
# - Se mancano: dipendenti, fatturato_range, aree_terapeutiche, arricchito_il, completezza_arricchimento
```

### **Task 2: Creare File Schema SQL**
Creare `db/migrations/001_enrichment_schema.sql`:
- Tabelle nuove
- Colonne in companies
- RPC functions
- Indici (GIN su aree_terapeutiche, indice su enrichment_queue.stato)

### **Task 3: Setup Progetto Node.js**
```bash
cd "C:\Users\Utente\Downloads\INDEX\LS Intelligence"
npm init -y
npm install @supabase/supabase-js axios dotenv
mkdir api
```

### **Task 4: Copia Agente dal Brief**
Copiare il codice dal brief ENRICHMENT_BRIEF.md in:
- `enrichment-agent.js` (main logic)
- `.env.example` (template variabili)

### **Task 5: Populate Therapeutic Areas Glossary**
Inserire in Supabase i codici:
```
ONCO (Oncologia)
CARDIO (Cardiologia)
ENDOC (Endocrinologia)
IMMUN (Immunologia)
NEURO (Neurologia)
GASTRO (Gastroenterologia)
RHEUM (Reumatologia)
DERM (Dermatologia)
INFECT (Infettive)
RARE (Malattie Rare)
PEDIATRICS
PATHOLOGY
```

---

## 📈 Success Metrics

Dopo implementazione completa:
- ✅ 8 aziende/giorno arricchite automaticamente
- ✅ Completeness medio ≥ 75% per azienda
- ✅ Errori < 5% (max 1 su 20)
- ✅ Tempo medio per azienda < 5 min
- ✅ API cost = €0 (tutti free tier)
- ✅ Decision makers identificati per ≥ 60% aziende

---

## 🚨 Rischi Identificati

1. **No Backend Separato**
   - Rischio: Vercel Function deve connettersi a Supabase con service_role_key
   - Mitigazione: Variabile `.env` Vercel + RLS policies

2. **Hallucination LLM**
   - Rischio: Groq/Gemini inventano dati se prompt non preciso
   - Mitigazione: Prompt with explicit "null if not found", validazione post-estrazione

3. **Rate Limiting API**
   - Rischio: Tavily/Brave/Jina/Groq hanno quota free limitata
   - Mitigazione: Exponential backoff, fallback chain, 8 aziende/giorno

4. **Matching Azienda Ambiguo**
   - Rischio: "ABC Pharma" potrebbe riferirsi a 5 aziende diverse
   - Mitigazione: Disambigua usando sito web salvato (se presente)

---

## 📋 Checklist Prossimi Step

- [ ] Verifica schema Supabase attuale
- [ ] Crea file migration SQL (enrichment_queue, enrichment_log, company_contacts, therapeutic_areas_glossary)
- [ ] Inizializza progetto Node.js (package.json, npm install)
- [ ] Copia enrichment-agent.js dal brief
- [ ] Setup Vercel (api/enrichment.js, vercel.json)
- [ ] Test locale con 3 aziende di prova
- [ ] Populate therapeutic_areas_glossary in Supabase
- [ ] UI: aggiungi sezione "Dati Arricchiti" in company-detail
- [ ] Deploy a Vercel e configura cron
- [ ] Monitor e refine per 3 giorni

---

## 💬 Prossime Azioni Consigliate

1. **Conferma priorità:** Vuoi partire subito con FASE 1 (Schema), oppure prima verificare lo stato attuale di Supabase?
2. **API Keys:** Dimmi se già hai Tavily + Brave keys, oppure dobbiamo registrarci.
3. **Budget:** Verifica se il progetto Supabase è su piano gratuito o pagato (influenza RLS policies).
