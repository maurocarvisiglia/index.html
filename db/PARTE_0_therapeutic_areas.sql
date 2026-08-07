-- PARTE 0: Crea therapeutic_areas_glossary e popola
-- Esegui SOLO questa parte se il primo script ha fallito

CREATE TABLE IF NOT EXISTS therapeutic_areas_glossary (
  codice TEXT PRIMARY KEY,
  nome_it TEXT NOT NULL UNIQUE,
  nome_en TEXT,
  descrizione TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Popola glossario
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

SELECT COUNT(*) as "✅ Aree terapeutiche create" FROM therapeutic_areas_glossary;
