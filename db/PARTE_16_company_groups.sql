-- Gruppi aziendali (Bayer, Menarini, GSK...) — richiesta esplicita di Mauro
-- 07/09/2026: aziende con piu' ragioni sociali/entita' legali diverse (es.
-- "Bayer Italia SpA", "Bayer AG", "Bayer Consumer Health AG") restano righe
-- separate in companies (settore, prodotti, annunci diversi per ciascuna —
-- a differenza di un duplicato vero, qui NON si fonde nulla), ma vengono
-- collegate a un gruppo comune per: mostrare le sorelle in scheda azienda,
-- condividere i fatti CORE di tipo 'gruppo', aggregare i KPI a livello di
-- gruppo.
--
-- Tabella separata (non un semplice self-FK su companies) perche' il gruppo
-- e' un concetto a se': puo' avere un nome/sito proprio anche quando nessuna
-- singola riga companies rappresenta bene la "casa madre".

CREATE TABLE IF NOT EXISTS company_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_group_id uuid REFERENCES company_groups(id);
CREATE INDEX IF NOT EXISTS idx_companies_company_group_id ON companies(company_group_id);

-- Verifica
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'company_group_id';
SELECT table_name FROM information_schema.tables WHERE table_name = 'company_groups';
