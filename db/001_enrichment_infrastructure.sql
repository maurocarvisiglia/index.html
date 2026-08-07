-- ============================================
-- MIGRATION: Enrichment Infrastructure
-- Data: 2026-08-07
-- Descrizione: Schema completo per l'agente di arricchimento automatico
-- ============================================

-- ─────────────────────────────────────────────
-- 1. ALTER TABLE companies — Aggiungi colonne
-- ─────────────────────────────────────────────

ALTER TABLE companies ADD COLUMN IF NOT EXISTS dipendenti INT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS fatturato_range TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS aree_terapeutiche TEXT[];
ALTER TABLE companies ADD COLUMN IF NOT EXISTS descrizione_aziendale TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS arricchito_il TIMESTAMP WITH TIME ZONE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS completezza_arricchimento INT DEFAULT 0;

-- Commenti alle colonne
COMMENT ON COLUMN companies.dipendenti IS 'Numero di dipendenti (estratto automaticamente)';
COMMENT ON COLUMN companies.fatturato_range IS 'Range di fatturato: <5M, 5-20M, 20-100M, 100-250M, 250-500M, >500M';
COMMENT ON COLUMN companies.aree_terapeutiche IS 'Array di codici aree terapeutiche: ONCO, CARDIO, IMMUN, ecc.';
COMMENT ON COLUMN companies.descrizione_aziendale IS 'Descrizione di cosa fa l azienda (portfolio, specialità)';
COMMENT ON COLUMN companies.arricchito_il IS 'Timestamp ultimo arricchimento automatico';
COMMENT ON COLUMN companies.completezza_arricchimento IS 'Percentuale di completamento (0-100%)';

-- ─────────────────────────────────────────────
-- 2. CREATE TABLE therapeutic_areas_glossary
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS therapeutic_areas_glossary (
  codice TEXT PRIMARY KEY,
  nome_it TEXT NOT NULL UNIQUE,
  nome_en TEXT,
  descrizione TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE therapeutic_areas_glossary IS 'Glossario mappatura codici aree terapeutiche';

-- Popola glossario (0-hallucination)
INSERT INTO therapeutic_areas_glossary (codice, nome_it, nome_en, descrizione) VALUES
  ('ONCO', 'Oncologia', 'Oncology', 'Trattamento dei tumori maligni'),
  ('CARDIO', 'Cardiologia', 'Cardiology', 'Malattie cardiovascolari'),
  ('ENDOC', 'Endocrinologia', 'Endocrinology', 'Diabete, obesità, malattie endocrine'),
  ('IMMUN', 'Immunologia', 'Immunology', 'Malattie autoimmuni, immunooncologia'),
  ('NEURO', 'Neurologia', 'Neurology', 'SNC, Parkinson, Alzheimer, epilessia'),
  ('GASTRO', 'Gastroenterologia', 'Gastroenterology', 'Malattie GI, IBD'),
  ('RHEUM', 'Reumatologia', 'Rheumatology', 'Artrite reumatoide, malattie reumatiche'),
  ('DERM', 'Dermatologia', 'Dermatology', 'Malattie della pelle'),
  ('INFECT', 'Malattie infettive', 'Infectious Diseases', 'Antibiotici, antivirali, antiparassitari'),
  ('RARE', 'Malattie rare', 'Rare Diseases', 'Farmaci orfani'),
  ('PEDIATRICS', 'Pediatria', 'Pediatrics', 'Farmaci pediatrici'),
  ('PATHOLOGY', 'Patologia', 'Pathology', 'Diagnostica, pathology services'),
  ('RESPIRATORY', 'Pneumologia', 'Respiratory', 'Asma, BPCO, CF'),
  ('ONCOHEME', 'Oncoematologia', 'Oncohematology', 'Tumori ematologici'),
  ('NEPHRO', 'Nefrologia', 'Nephrology', 'Malattie renali'),
  ('HEPATO', 'Epatologia', 'Hepatology', 'Epatite, cirrosi, epatocarcinoma')
ON CONFLICT (codice) DO NOTHING;

-- ─────────────────────────────────────────────
-- 3. CREATE TABLE enrichment_queue
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS enrichment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  stato TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, failed
  priorita INT DEFAULT 0,
  tentativo_numero INT DEFAULT 0,
  prossimo_tentativo_il TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  errore_ultimo TEXT,
  arricchito_il TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE enrichment_queue IS 'Coda di aziende in attesa di arricchimento automatico';
COMMENT ON COLUMN enrichment_queue.stato IS 'Stato: pending (in attesa), in_progress (in elaborazione), completed (completato), failed (errore permanente)';
COMMENT ON COLUMN enrichment_queue.priorita IS 'Priorità (calcolata da job frequency ultimi 30gg)';
COMMENT ON COLUMN enrichment_queue.tentativo_numero IS 'Numero di tentativi effettuati (0-4)';
COMMENT ON COLUMN enrichment_queue.prossimo_tentativo_il IS 'Timestamp prossimo retry (exponential backoff: 1h→6h→24h→48h→72h)';
COMMENT ON COLUMN enrichment_queue.errore_ultimo IS 'Messaggio errore ultimo tentativo';

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_stato ON enrichment_queue(stato);
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_prossimo_tentativo ON enrichment_queue(prossimo_tentativo_il) WHERE stato = 'pending';
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_priorita ON enrichment_queue(priorita DESC);

-- ─────────────────────────────────────────────
-- 4. CREATE TABLE enrichment_log
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS enrichment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  api_usata TEXT, -- 'tavily', 'brave', 'jina', 'firecrawl', 'groq', 'gemini'
  url_processato TEXT,
  risultato_grezzo JSONB,
  parsing_riuscito BOOLEAN DEFAULT FALSE,
  campi_estratti JSONB,
  errore_messaggio TEXT,
  durata_secondi INT,
  tokens_usati INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE enrichment_log IS 'Audit trail di ogni tentativo di arricchimento';
COMMENT ON COLUMN enrichment_log.api_usata IS 'Quale API è stata usata per il tentativo';
COMMENT ON COLUMN enrichment_log.risultato_grezzo IS 'JSON grezzo dell estrattore (prima della validazione)';
COMMENT ON COLUMN enrichment_log.parsing_riuscito IS 'True se parsing JSON è riuscito';
COMMENT ON COLUMN enrichment_log.campi_estratti IS 'JSON con campi effettivamente salvati in companies';
COMMENT ON COLUMN enrichment_log.durata_secondi IS 'Tempo impiegato per il tentativo';
COMMENT ON COLUMN enrichment_log.tokens_usati IS 'Token LLM consumati (per monitorare costi)';

-- Indici
CREATE INDEX IF NOT EXISTS idx_enrichment_log_company_id ON enrichment_log(company_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_log_timestamp ON enrichment_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_enrichment_log_api ON enrichment_log(api_usata);

-- ─────────────────────────────────────────────
-- 5. CREATE TABLE company_contacts
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome TEXT,
  ruolo TEXT,
  email TEXT,
  telefono TEXT,
  linkedin_url TEXT,
  fonte_scoperta TEXT DEFAULT 'web', -- 'web', 'linkedin', 'sito_ufficiale', 'news', ecc.
  verificato BOOLEAN DEFAULT FALSE,
  estratto_il TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_email CHECK (email IS NULL OR email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);

COMMENT ON TABLE company_contacts IS 'Decision makers e contatti per azienda (estratti automaticamente)';
COMMENT ON COLUMN company_contacts.fonte_scoperta IS 'Dove è stato trovato il contatto (sito web, LinkedIn, news, pagina carriere, ecc.)';
COMMENT ON COLUMN company_contacts.verificato IS 'True se il contatto è stato verificato manualmente';
COMMENT ON COLUMN company_contacts.note IS 'Note aggiuntive (es. "Fuori sede", "Email non attiva", ecc.)';

-- Indici
CREATE INDEX IF NOT EXISTS idx_company_contacts_company_id ON company_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_company_contacts_email ON company_contacts(email);
CREATE INDEX IF NOT EXISTS idx_company_contacts_verified ON company_contacts(verificato);

-- ─────────────────────────────────────────────
-- 6. RPC FUNCTION: enrichment_stats_daily
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION enrichment_stats_daily()
RETURNS TABLE (
  completed BIGINT,
  in_progress BIGINT,
  pending BIGINT,
  failed BIGINT,
  avg_completeness NUMERIC,
  total_companies_enriched BIGINT,
  api_tavily_count BIGINT,
  api_brave_count BIGINT,
  api_jina_count BIGINT,
  api_firecrawl_count BIGINT,
  llm_groq_count BIGINT,
  llm_gemini_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM enrichment_queue WHERE stato = 'completed' AND DATE(updated_at) = CURRENT_DATE)::BIGINT,
    (SELECT COUNT(*) FROM enrichment_queue WHERE stato = 'in_progress')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_queue WHERE stato = 'pending')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_queue WHERE stato = 'failed' AND DATE(updated_at) = CURRENT_DATE)::BIGINT,
    (SELECT AVG(completezza_arricchimento)::NUMERIC FROM companies WHERE arricchito_il >= NOW() - INTERVAL '1 day'),
    (SELECT COUNT(*) FROM companies WHERE arricchito_il >= NOW() - INTERVAL '1 day')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_log WHERE DATE(timestamp) = CURRENT_DATE AND api_usata = 'tavily')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_log WHERE DATE(timestamp) = CURRENT_DATE AND api_usata = 'brave')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_log WHERE DATE(timestamp) = CURRENT_DATE AND api_usata = 'jina')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_log WHERE DATE(timestamp) = CURRENT_DATE AND api_usata = 'firecrawl')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_log WHERE DATE(timestamp) = CURRENT_DATE AND api_usata = 'groq')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_log WHERE DATE(timestamp) = CURRENT_DATE AND api_usata = 'gemini')::BIGINT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION enrichment_stats_daily() IS 'Statistiche giornaliere arricchimento';

-- ─────────────────────────────────────────────
-- 7. RPC FUNCTION: get_company_job_frequency
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_company_job_frequency(days INT DEFAULT 30)
RETURNS TABLE (
  company_id UUID,
  frequency BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    COUNT(j.id)::BIGINT as freq
  FROM companies c
  LEFT JOIN job_listings j ON j.company_id = c.id
    AND j.created_at >= NOW() - (days || ' days')::INTERVAL
  GROUP BY c.id
  ORDER BY freq DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_company_job_frequency(INT) IS 'Calcola frequenza annunci per azienda (ultimi N giorni)';

-- ─────────────────────────────────────────────
-- 8. GRANT RLS & PERMISSIONS
-- ─────────────────────────────────────────────

-- Abilita RLS
ALTER TABLE enrichment_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrichment_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapeutic_areas_glossary ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read (no write from frontend)
CREATE POLICY "enrichment_queue_read" ON enrichment_queue FOR SELECT USING (true);
CREATE POLICY "enrichment_log_read" ON enrichment_log FOR SELECT USING (true);
CREATE POLICY "company_contacts_read" ON company_contacts FOR SELECT USING (true);
CREATE POLICY "therapeutic_areas_read" ON therapeutic_areas_glossary FOR SELECT USING (true);

-- Policy: only service_role can write enrichment tables
-- (questi UPDATE/INSERT vengono dal backend Node.js, non dal frontend)
-- Già gestito da RLS: anon user non può scrivere, solo service_role

-- ─────────────────────────────────────────────
-- 9. GRANT EXECUTE on RPC functions
-- ─────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION enrichment_stats_daily() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_company_job_frequency(INT) TO authenticated, anon;

-- ─────────────────────────────────────────────
-- DONE!
-- ─────────────────────────────────────────────
--
-- Prossimi step:
-- 1. Esegui questo script nel SQL editor di Supabase
-- 2. Verifica che tutte le tabelle siano create
-- 3. Aggiungi enrichment_queue records per aziende prioritarie (con INSERT manuale o via backend)
-- 4. Testa le RPC functions
-- 5. Configura le API keys nel backend Node.js
