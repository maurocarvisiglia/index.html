-- "Arricchiamo una, arricchiamo tutte" (richiesta di Mauro 07/09/2026): un
-- fatto CORE di tipo 'gruppo' (descrizione della casa madre) trovato per
-- un'azienda va copiato automaticamente sulle sorelle collegate nello stesso
-- company_groups — prodotti, annunci e settore restano propri di ciascuna
-- azienda, solo il fatto 'gruppo' si condivide.
--
-- Trigger (non codice applicativo) cosi' vale per QUALSIASI punto di
-- scrittura di company_facts, presente o futuro (script CORE, inserimento
-- manuale...), senza dover ricordarsi di duplicare la logica ovunque.
--
-- Sicuro rispetto a ricorsione infinita: la propagazione stessa inserisce
-- righe con lo stesso (company_id, tipo, valore_norm) delle sorelle, quindi
-- ri-innesca il trigger ma ON CONFLICT DO NOTHING la ferma non appena la
-- riga esiste gia' — con gruppi piccoli (2-7 aziende) converge in una
-- manciata di passaggi.

CREATE OR REPLACE FUNCTION propaga_fatto_gruppo() RETURNS trigger AS $$
BEGIN
  IF NEW.tipo = 'gruppo' THEN
    INSERT INTO company_facts (company_id, tipo, valore, fonte, prova, url, worker)
    SELECT c2.id, NEW.tipo, NEW.valore, NEW.fonte, NEW.prova, NEW.url, NEW.worker
    FROM companies c1
    JOIN companies c2 ON c2.company_group_id = c1.company_group_id AND c2.id <> c1.id
    WHERE c1.id = NEW.company_id AND c1.company_group_id IS NOT NULL
    ON CONFLICT (company_id, tipo, valore_norm) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_propaga_fatto_gruppo ON company_facts;
CREATE TRIGGER trg_propaga_fatto_gruppo
AFTER INSERT ON company_facts
FOR EACH ROW EXECUTE FUNCTION propaga_fatto_gruppo();

-- Verifica
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_propaga_fatto_gruppo';
