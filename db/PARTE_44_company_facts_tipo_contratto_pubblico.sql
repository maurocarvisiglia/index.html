-- company_facts.tipo non ammette 'contratto_pubblico' — serve per registrare
-- aggiudicazioni di gare/convenzioni pubbliche (ASL, centrali di committenza
-- regionali) che assegnano a un'azienda uno specifico territorio/lotto per un
-- servizio: e' un dato di intelligence commerciale che nessun'altra fonte gia'
-- in database cattura (ne' AIFA ne' il registro dispositivi dicono CHI serve
-- QUALE ASL, solo COSA e' autorizzato a vendere).
--
-- Caso reale che lo rende necessario (23/09/2026, verificato leggendo
-- direttamente scr.piemonte.it): la convenzione Piemonte 04-2021 per
-- l'ossigenoterapia domiciliare assegna lotti territoriali diversi a Vivisol,
-- Medicair Italia (RTI con Nippon Sanso Pharma), Medigas Italia, Vitalaire
-- Italia e Sapio Life (RTI con SICO) — sapere che Medigas serve le ASL
-- TO4/CN1/CN2 e non le altre e' esattamente il tipo di dato che serve alla
-- mappatura commerciale richiesta da Mauro, e va tenuto separato dai fatti
-- CORE (prodotto/gruppo/sede) perche' ha una fonte e un formato diversi:
-- l'ente appaltante, il numero di gara/CIG, la scadenza del contratto.
--
-- Stesso approccio prudente delle precedenti (partnership_commerciale,
-- certificazione_gmp): legge il vincolo reale e aggiunge un solo valore,
-- senza riscrivere l'elenco a mano.

DO $$
DECLARE
  def text;
  valori text[];
  nuova_lista text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conrelid = 'public.company_facts'::regclass
    AND conname = 'cf_tipo_chk';

  IF def IS NULL THEN
    RAISE EXCEPTION 'Vincolo cf_tipo_chk non trovato — controlla manualmente il nome del vincolo.';
  END IF;

  SELECT array_agg(m[1]) INTO valori
  FROM regexp_matches(def, '''([^'']*)''', 'g') AS m;

  IF valori IS NULL OR array_length(valori, 1) IS NULL THEN
    RAISE EXCEPTION 'Non sono riuscito a leggere i valori ammessi dalla definizione attuale: %', def;
  END IF;

  RAISE NOTICE 'Valori attuali di cf_tipo_chk: %', valori;

  IF 'contratto_pubblico' = ANY(valori) THEN
    RAISE NOTICE 'contratto_pubblico e'' gia'' presente, nessuna modifica necessaria.';
  ELSE
    valori := array_append(valori, 'contratto_pubblico');
    SELECT string_agg(quote_literal(v), ', ') INTO nuova_lista FROM unnest(valori) v;

    ALTER TABLE public.company_facts DROP CONSTRAINT cf_tipo_chk;
    EXECUTE format('ALTER TABLE public.company_facts ADD CONSTRAINT cf_tipo_chk CHECK (tipo IN (%s))', nuova_lista);

    RAISE NOTICE 'Nuovo elenco di cf_tipo_chk: %', valori;
  END IF;
END $$;

-- Verifica: deve comparire 'contratto_pubblico' nell'elenco
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.company_facts'::regclass AND conname = 'cf_tipo_chk';
