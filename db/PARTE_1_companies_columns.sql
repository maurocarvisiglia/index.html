-- PARTE 1: Aggiungi colonne a companies
-- Esegui questa parte per aggiungere i campi di arricchimento

ALTER TABLE companies ADD COLUMN IF NOT EXISTS dipendenti INT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS fatturato_range TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS aree_terapeutiche TEXT[];
ALTER TABLE companies ADD COLUMN IF NOT EXISTS descrizione_aziendale TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS arricchito_il TIMESTAMP WITH TIME ZONE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS completezza_arricchimento INT DEFAULT 0;

-- Verifica che le colonne siano state create
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'companies'
  AND column_name IN ('dipendenti', 'fatturato_range', 'aree_terapeutiche', 'descrizione_aziendale', 'arricchito_il', 'completezza_arricchimento')
ORDER BY column_name;
