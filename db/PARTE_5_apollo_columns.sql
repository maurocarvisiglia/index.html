-- PARTE 5: Colonne per arricchimento Apollo.io
-- Esegui nell'SQL Editor di Supabase

-- Crescita dipendenti negli ultimi 12 mesi (frazione, es. 0.05 = +5%), da Apollo organization_headcount_twelve_month_growth
ALTER TABLE companies ADD COLUMN IF NOT EXISTS crescita_dipendenti_12m NUMERIC;

-- Keyword grezze restituite da Apollo (business/terapeutiche) — SOLO come base per un
-- futuro controllo incrociato con IA contro la tassonomia reale (therapeutic_areas).
-- Non scrivere MAI direttamente su aree_terapeutiche da questo campo senza verifica.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS apollo_keywords TEXT[];

-- Verifica
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'companies'
  AND column_name IN ('crescita_dipendenti_12m', 'apollo_keywords')
ORDER BY column_name;
