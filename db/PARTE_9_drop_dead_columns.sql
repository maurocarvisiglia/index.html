-- Elimina 2 colonne di companies senza alcun connettore di lettura/scrittura in
-- tutto il codice (verificato: zero riferimenti in index.html, script, RPC, RLS).
-- company_type e' diverso da salary_benchmarks.company_type (tabella distinta,
-- non toccata da questa migration).
--
-- Diagnosticato durante l'analisi della pagina azienda (AstraZeneca) del 27/08/2026.

ALTER TABLE companies DROP COLUMN IF EXISTS company_type;
ALTER TABLE companies DROP COLUMN IF EXISTS last_scraped_at;
