-- Test semplice: crea una tabella minimale

DROP TABLE IF EXISTS therapeutic_areas_glossary CASCADE;

CREATE TABLE therapeutic_areas_glossary (
  codice TEXT PRIMARY KEY,
  nome_it TEXT NOT NULL,
  nome_en TEXT,
  descrizione TEXT
);

INSERT INTO therapeutic_areas_glossary (codice, nome_it, nome_en, descrizione) VALUES
  ('ONCO', 'Oncologia', 'Oncology', 'Tumori'),
  ('CARDIO', 'Cardiologia', 'Cardiology', 'Cuore'),
  ('IMMUN', 'Immunologia', 'Immunology', 'Sistema immune');

SELECT * FROM therapeutic_areas_glossary;
