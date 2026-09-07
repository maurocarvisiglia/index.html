-- Blocklist aziende — richiesta esplicita di Mauro 07/09/2026: le aziende
-- eliminate perche' non sono vere aziende Life Sciences (nome di persona
-- scambiato per azienda, studio legale, scuola di musica...) non devono
-- poter rientrare da un futuro import (CSV Vocations, API Vocations, o
-- qualunque altro punto di creazione azienda) se il nome ricompare in una
-- fonte esterna.
--
-- Chiave sul nome NORMALIZZATO con la stessa normalizeCompanyName() gia'
-- usata da findOrCreateCompany() per riconoscere aziende esistenti — cosi'
-- "Celentano Gaetano", "CELENTANO GAETANO" e "Celentano Gaetano S.r.l."
-- sono la stessa voce bloccata.

CREATE TABLE IF NOT EXISTS companies_blocklist (
  name_norm text PRIMARY KEY,
  nome_originale text NOT NULL,
  motivo text,
  blocked_at timestamptz NOT NULL DEFAULT now()
);

-- Verifica
SELECT table_name FROM information_schema.tables WHERE table_name = 'companies_blocklist';
