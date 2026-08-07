# 🚀 Setup Enrichment Agent — Backend Node.js

## 📋 File Creati

```
├── package.json                    ← Dipendenze Node.js
├── enrichment-agent.js             ← Logica principale agente
├── .env.example                    ← Template variabili
├── api/enrichment.js               ← Vercel Function (cron)
└── vercel.json                     ← Configurazione cron
```

---

## 🔧 Setup Locale (Testing)

### 1. Installa dipendenze

```bash
cd "C:\Users\Utente\Downloads\INDEX\LS Intelligence"
npm install
```

### 2. Configura .env

Copia `.env.example` → `.env` e riempi le variabili:

```bash
cp .env.example .env
```

Poi edita `.env` con le tue API keys:

```env
SUPABASE_URL=https://ehrayeltqottgvkzvbdk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<completa con la tua chiave>
TAVILY_API_KEY=<se hai>
BRAVE_SEARCH_API_KEY=<se hai>
GROQ_API_KEY=<se hai>
GEMINI_API_KEY=<se hai>
```

### 3. Test Locale

```bash
node enrichment-agent.js
```

Output atteso:
```
============================================================
🌅 ENRICHMENT AUTONOMO - 2026-08-07T12:34:56.789Z
============================================================
ℹ️  Selezionando aziende dalla coda (limite: 8)...
📋 Trovate 0 aziende per arricchimento (limite: 8)
✅ Coda vuota o tutte in attesa retry. Uscita.
============================================================
✅ RUN GIORNALIERO COMPLETATO
============================================================
```

Se vedi questo → ✅ Tutto funziona! (la coda è vuota, che è normale)

---

## 🧪 Test con Azienda di Prova

### Step 1: Inserisci azienda test in enrichment_queue

Nel Supabase SQL Editor:

```sql
-- Inserisci un'azienda test nella coda
INSERT INTO enrichment_queue (company_id, stato, priorita, prossimo_tentativo_il)
SELECT id, 'pending', 10, NOW()
FROM companies
WHERE nome_azienda LIKE '%Cosmetic%' OR nome_azienda LIKE '%3B%'
LIMIT 1;

-- Verifica
SELECT company_id, stato, priorita FROM enrichment_queue LIMIT 5;
```

### Step 2: Esegui agente

```bash
node enrichment-agent.js
```

Osserva i log per vedere:
- ✅ Azienda selezionata
- ✅ URL trovato (Tavily/Brave)
- ✅ Testo estratto (Jina)
- ✅ Dati strutturati (Groq/Gemini)
- ✅ Dati salvati

### Step 3: Verifica dati salvati

Nel SQL Editor:

```sql
-- Verifica che i dati siano stati salvati
SELECT 
  nome_azienda,
  dipendenti,
  fatturato_range,
  aree_terapeutiche,
  completezza_arricchimento,
  arricchito_il
FROM companies
WHERE dipendenti IS NOT NULL OR arricchito_il IS NOT NULL
LIMIT 5;

-- Verifica decision makers
SELECT 
  nome,
  ruolo,
  email,
  fonte_scoperta
FROM company_contacts
LIMIT 5;

-- Verifica log
SELECT 
  company_id,
  api_usata,
  parsing_riuscito,
  campi_estratti
FROM enrichment_log
ORDER BY timestamp DESC
LIMIT 5;
```

---

## 🚢 Deploy su Vercel

### 1. Collega il repo a Vercel

```bash
# Se non hai git ancora
git init
git add .
git commit -m "Add enrichment agent infrastructure"
git remote add origin https://github.com/YOUR_ORG/ls-intelligence.git
git push -u origin main
```

Poi in Vercel dashboard:
- Connetti il repo GitHub
- Seleziona il branch `main`
- Vercel deployerà automaticamente

### 2. Configura Environment Variables in Vercel

Vai a: **Settings → Environment Variables**

Aggiungi:
- `SUPABASE_URL` = `https://ehrayeltqottgvkzvbdk.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = (la tua chiave service role)
- `TAVILY_API_KEY` = (se hai)
- `BRAVE_SEARCH_API_KEY` = (se hai)
- `GROQ_API_KEY` = (se hai)
- `GEMINI_API_KEY` = (se hai)
- `VERCEL_CRON_SECRET` = (genera una stringa casuale per sicurezza)

### 3. Verifica Cron

Vai a: **Settings → Cron Jobs**

Dovresti vedere:
```
POST /api/enrichment
Schedule: 0 2 * * * (alle 02:00 UTC ogni giorno)
```

### 4. Test Manuale

Clicca "Test" sul cron job. Output atteso:
```json
{
  "message": "Enrichment completato",
  "timestamp": "2026-08-07T02:00:00.123Z"
}
```

---

## 📊 Monitoraggio

### Logs su Vercel

Vai a: **Deployments → Logs** per vedere i log dell'ultimo run

### Dashboard Metriche

Nel SQL Editor di Supabase:

```sql
-- Metriche giornaliere
SELECT * FROM enrichment_stats_daily();

-- Ultimi tentativi
SELECT 
  company_id,
  api_usata,
  parsing_riuscito,
  durata_secondi,
  errore_messaggio,
  timestamp
FROM enrichment_log
ORDER BY timestamp DESC
LIMIT 20;

-- Aziende completate oggi
SELECT COUNT(*) as completate_oggi
FROM enrichment_queue
WHERE stato = 'completed' AND DATE(updated_at) = CURRENT_DATE;
```

---

## 🐛 Troubleshooting

### Errore: "SUPABASE_SERVICE_ROLE_KEY non configurato"
→ Controlla che `.env` sia presente e compilato con tutte le variabili

### Errore: "Cannot find module '@supabase/supabase-js'"
→ Esegui `npm install` di nuovo

### Aziende non vengono arricchite
→ 1. Verifica che enrichment_queue abbia records con `stato = 'pending'`
   2. Controlla che le API keys (Tavily, Brave, Groq, Gemini) siano valide
   3. Vedi i log di Vercel per errori specifici

### Cron non si esegue
→ 1. Verifica che `vercel.json` sia presente e formattato correttamente
   2. Controlla in Vercel dashboard che il cron job sia visibile
   3. Esegui un "Test" manuale dal dashboard

---

## 📈 Prossimi Step

1. **Aggiungi UI Frontend** (company-detail: sezione "Dati Arricchiti")
2. **Popola enrichment_queue** con le aziende prioritarie
3. **Monitor** metriche per 3 giorni e aggiusta prompt se necessario
4. **Implementa webhook** per notifiche slack su errori

---

## ✅ Checklist Pre-Production

- [ ] `.env` compilato con tutte le API keys
- [ ] `npm install` eseguito localmente
- [ ] Test locale: `node enrichment-agent.js` → ✅ success
- [ ] Test con azienda di prova → vedi dati in company_contacts
- [ ] Deploy Vercel completato
- [ ] Environment variables configurate in Vercel
- [ ] Cron schedule visibile in Vercel dashboard
- [ ] Test manuale cron da Vercel dashboard → ✅ success
- [ ] Aggiungi 8-10 aziende in enrichment_queue
- [ ] Aspetta domani mattina (02:00 UTC) per primo run autonomo

---

**Dimmi quando il setup locale è OK e il test passa! 🚀**
