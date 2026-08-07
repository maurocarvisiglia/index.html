# 🗄️ Setup Schema Supabase per Enrichment Agent

## 📋 Ordine di Esecuzione

Esegui i seguenti file **nell'ordine esatto** nel SQL editor di Supabase:

```
1️⃣ PARTE_0_therapeutic_areas.sql     ← Glossario aree terapeutiche
2️⃣ PARTE_1_companies_columns.sql     ← Aggiungi colonne a companies
3️⃣ PARTE_2_enrichment_tables.sql     ← Crea 3 tabelle nuove
4️⃣ PARTE_3_rpc_functions.sql         ← Crea RPC functions
5️⃣ PARTE_4_rls_policies.sql          ← Abilita RLS
```

---

## 🚀 Come Eseguire

### Per ogni file:

1. **Accedi a Supabase**: https://supabase.com/dashboard/project/ehrayeltqottgvkzvbdk
2. **Vai a "SQL Editor"** (menu sinistro)
3. **Clicca "New Query"**
4. **Copia il contenuto** del file .sql
5. **Incolla** nel editor
6. **Clicca "Run"** ▶️
7. **Controlla che non ci siano errori** ❌ = fallimento, ✅ = successo
8. **Procedi al file successivo**

---

## ✅ Verifiche Post-Esecuzione

Dopo aver eseguito **TUTTI** i file, esegui questa query nel SQL Editor per confermare tutto:

```sql
-- 🔍 VERIFICHE FINALI

-- 1. Verifica colonne companies (deve mostrare 6 righe)
SELECT COUNT(*) as "✅ Colonne aggiunte" 
FROM information_schema.columns
WHERE table_name = 'companies'
  AND column_name IN ('dipendenti', 'fatturato_range', 'aree_terapeutiche', 'descrizione_aziendale', 'arricchito_il', 'completezza_arricchimento');

-- 2. Verifica tabelle (deve mostrare 4 righe)
SELECT COUNT(*) as "✅ Tabelle create"
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('enrichment_queue', 'enrichment_log', 'company_contacts', 'therapeutic_areas_glossary');

-- 3. Verifica glossario (deve mostrare 16)
SELECT COUNT(*) as "✅ Aree terapeutiche" FROM therapeutic_areas_glossary;

-- 4. Verifica RPC functions (deve mostrare 2)
SELECT COUNT(*) as "✅ RPC functions"
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('enrichment_stats_daily', 'get_company_job_frequency');

-- 5. Verifica RLS policies (deve mostrare 4)
SELECT COUNT(*) as "✅ RLS policies"
FROM pg_policies
WHERE tablename IN ('enrichment_queue', 'enrichment_log', 'company_contacts', 'therapeutic_areas_glossary');

-- 6. Test RPC (deve ritornare una riga)
SELECT * FROM enrichment_stats_daily();
```

Se tutti i COUNT ritornano il numero atteso ✅, lo schema è corretto!

---

## 📊 Schema Finale

```
┌─────────────────────────────────────────────────────────────┐
│                    companies (MODIFICATA)                   │
├─────────────────────────────────────────────────────────────┤
│ id, nome_azienda, sito_web, tipo, stato, ...                │
│ + dipendenti (INT)                                          │
│ + fatturato_range (TEXT: <5M | 5-20M | ... | >500M)        │
│ + aree_terapeutiche (TEXT[])                                │
│ + descrizione_aziendale (TEXT)                              │
│ + arricchito_il (TIMESTAMP)                                 │
│ + completezza_arricchimento (INT 0-100)                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│        therapeutic_areas_glossary (NUOVA) — 16 righe        │
├─────────────────────────────────────────────────────────────┤
│ codice (PK), nome_it, nome_en, descrizione                  │
│ ONCO, CARDIO, ENDOC, IMMUN, NEURO, GASTRO, RHEUM, DERM,   │
│ INFECT, RARE, PEDIATRICS, PATHOLOGY, RESPIRATORY, ...      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│         enrichment_queue (NUOVA) — coda di aziende          │
├─────────────────────────────────────────────────────────────┤
│ id, company_id (FK), stato, priorita, tentativo_numero,     │
│ prossimo_tentativo_il, errore_ultimo, arricchito_il         │
│ Indici: stato, prossimo_tentativo, priorita                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│       enrichment_log (NUOVA) — audit trail tentativi        │
├─────────────────────────────────────────────────────────────┤
│ id, company_id (FK), timestamp, api_usata, url_processato,  │
│ risultato_grezzo (JSONB), parsing_riuscito, campi_estratti, │
│ errore_messaggio, durata_secondi, tokens_usati              │
│ Indici: company_id, timestamp, api                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│     company_contacts (NUOVA) — decision makers estratti     │
├─────────────────────────────────────────────────────────────┤
│ id, company_id (FK), nome, ruolo, email, telefono,          │
│ linkedin_url, fonte_scoperta, verificato, note              │
│ Constraint: email valida, Indici: company_id, email         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│         RPC Functions (NUOVE) — Per monitoring              │
├─────────────────────────────────────────────────────────────┤
│ enrichment_stats_daily()                                    │
│   → completed, in_progress, pending, failed, avg_complete,  │
│     total_companies_enriched, api_counts, llm_counts        │
│                                                              │
│ get_company_job_frequency(days INT)                         │
│   → company_id, frequency (per calcolare priorità)          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔒 Row Level Security

Tutte le nuove tabelle hanno RLS **abilitato**:

| Tabella | SELECT | INSERT | UPDATE | DELETE |
|---------|--------|--------|--------|--------|
| enrichment_queue | ✅ Tutti | ❌ Solo service_role | ❌ Solo service_role | ❌ Solo service_role |
| enrichment_log | ✅ Tutti | ❌ Solo service_role | ❌ Solo service_role | ❌ Solo service_role |
| company_contacts | ✅ Tutti | ❌ Solo service_role | ❌ Solo service_role | ❌ Solo service_role |
| therapeutic_areas_glossary | ✅ Tutti | ❌ Solo service_role | ❌ Solo service_role | ❌ Solo service_role |

👉 **Nota**: Il frontend (authenticated users) può **LEGGERE** i dati, ma **NON può modificarli**. Solo il backend Node.js (che usa service_role_key) può scrivere.

---

## 🐛 Troubleshooting

### Errore: "relation does not exist"
→ Significa che uno dei file precedenti ha fallito. Rivedi l'output dell'esecuzione e controlla l'errore specifico.

### Errore: "duplicate key value violates unique constraint"
→ Una riga del glossario è stata inserita due volte. È OK, il file ha `ON CONFLICT DO NOTHING` per evitare questo.

### Errore: "does not have permissions"
→ Stai usando un user che non è owner del progetto. Usa l'account principale di Supabase.

---

## 📝 Prossimi Step

Dopo che lo schema è pronto:

1. **Crea backend Node.js** (`enrichment-agent.js`)
2. **Testa l'agente** con 3-5 aziende di prova
3. **Deploy su Vercel** con cron
4. **Aggiungi UI Frontend** per visualizzare dati arricchiti
5. **Monitor** metriche giornaliere

---

**Dimmi quando lo schema è pronto, e creo il resto! 🚀**
