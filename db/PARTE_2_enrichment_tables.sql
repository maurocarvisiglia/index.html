-- PARTE 2: Crea enrichment_queue, enrichment_log, company_contacts

-- ═══════════════════════════════════════════════════════════════
-- TABELLA: enrichment_queue
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS enrichment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  stato TEXT NOT NULL DEFAULT 'pending',
  priorita INT DEFAULT 0,
  tentativo_numero INT DEFAULT 0,
  prossimo_tentativo_il TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  errore_ultimo TEXT,
  arricchito_il TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_stato ON enrichment_queue(stato);
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_prossimo_tentativo ON enrichment_queue(prossimo_tentativo_il) WHERE stato = 'pending';
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_priorita ON enrichment_queue(priorita DESC);

-- ═══════════════════════════════════════════════════════════════
-- TABELLA: enrichment_log
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS enrichment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  api_usata TEXT,
  url_processato TEXT,
  risultato_grezzo JSONB,
  parsing_riuscito BOOLEAN DEFAULT FALSE,
  campi_estratti JSONB,
  errore_messaggio TEXT,
  durata_secondi INT,
  tokens_usati INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_enrichment_log_company_id ON enrichment_log(company_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_log_timestamp ON enrichment_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_enrichment_log_api ON enrichment_log(api_usata);

-- ═══════════════════════════════════════════════════════════════
-- TABELLA: company_contacts
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS company_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome TEXT,
  ruolo TEXT,
  email TEXT,
  telefono TEXT,
  linkedin_url TEXT,
  fonte_scoperta TEXT DEFAULT 'web',
  verificato BOOLEAN DEFAULT FALSE,
  estratto_il TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_email CHECK (email IS NULL OR email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_company_contacts_company_id ON company_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_company_contacts_email ON company_contacts(email);
CREATE INDEX IF NOT EXISTS idx_company_contacts_verified ON company_contacts(verificato);

-- Verifica
SELECT tablename FROM pg_tables
WHERE tablename IN ('enrichment_queue', 'enrichment_log', 'company_contacts')
ORDER BY tablename;
