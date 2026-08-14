-- PARTE 6: Tassonomia industry Apollo (scollegata dalle tassonomie LS Intelligence)
-- + conteggio dipendenti per reparto generico (Apollo departmental_head_count)
-- Esegui nell'SQL Editor di Supabase

-- ═══════════════════════════════════════════════════════════════
-- 1. Categoria merceologica Apollo (industry) sulla singola azienda
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE companies ADD COLUMN IF NOT EXISTS apollo_industry TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS apollo_industries TEXT[];

-- ═══════════════════════════════════════════════════════════════
-- 2. Catalogo industry Apollo — si autopopola durante l'arricchimento,
--    non va mai riempito a mano. Scollegato da functional_areas/
--    therapeutic_areas/job_taxonomy: classifica l'AZIENDA nel suo
--    complesso, non i singoli annunci di lavoro.
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS apollo_industries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apollo_tag_id TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  prima_rilevazione TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- 3. Dipendenti per reparto generico (Apollo departmental_head_count).
--    Un reparto NON è il funzionale/terapeutico usato per i job listing:
--    sono categorie corporate generiche (engineering, sales, operations,
--    hr, legal, marketing, ecc.) — non esistono voci "Medical", "QA",
--    "QC", "Regulatory Affairs" o "Manufacturing" specifiche del pharma.
--    Una riga per azienda per reparto, aggiornabile (upsert).
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS company_department_headcount (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  headcount INT NOT NULL,
  fonte TEXT DEFAULT 'apollo',
  rilevato_il TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, department)
);

CREATE INDEX IF NOT EXISTS idx_company_department_headcount_company ON company_department_headcount(company_id);
CREATE INDEX IF NOT EXISTS idx_company_department_headcount_dept ON company_department_headcount(department);

-- Verifica
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'companies' AND column_name IN ('apollo_industry', 'apollo_industries')
ORDER BY column_name;

SELECT table_name FROM information_schema.tables
WHERE table_name IN ('apollo_industries', 'company_department_headcount');
