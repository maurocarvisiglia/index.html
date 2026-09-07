-- company_products.category non ammette 'principio_attivo' (verificato con un
-- inserimento di prova, respinto da "company_products_category_check") — serve
-- per distinguere un principio attivo farmaceutico (materia prima venduta ad
-- altre aziende, es. dal registro EDQM dei Certificati di Idoneità) da un
-- farmaco finito ('commercializzato', l'unico valore usato finora).
--
-- Stesso approccio prudente delle precedenti (PARTE_14/15): l'elenco originale
-- di questo vincolo non è mio, quindi non viene riscritto alla cieca. Il
-- blocco legge la definizione attuale, estrae i valori ammessi e aggiunge
-- 'principio_attivo' SOLO a quell'elenco letto dal vincolo reale.
--
-- Nessuna riga esistente viene toccata: si allarga solo l'insieme ammesso.

DO $$
DECLARE
  def text;
  valori text[];
  nuova_lista text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conrelid = 'public.company_products'::regclass
    AND conname = 'company_products_category_check';

  IF def IS NULL THEN
    RAISE EXCEPTION 'Vincolo company_products_category_check non trovato — controlla manualmente il nome del vincolo.';
  END IF;

  SELECT array_agg(m[1]) INTO valori
  FROM regexp_matches(def, '''([^'']*)''', 'g') AS m;

  IF valori IS NULL OR array_length(valori, 1) IS NULL THEN
    RAISE EXCEPTION 'Non sono riuscito a leggere i valori ammessi dalla definizione attuale: %', def;
  END IF;

  RAISE NOTICE 'Valori attuali di company_products_category_check: %', valori;

  IF 'principio_attivo' = ANY(valori) THEN
    RAISE NOTICE 'principio_attivo è già presente, nessuna modifica necessaria.';
  ELSE
    valori := array_append(valori, 'principio_attivo');
    SELECT string_agg(quote_literal(v), ', ') INTO nuova_lista FROM unnest(valori) v;

    ALTER TABLE public.company_products DROP CONSTRAINT company_products_category_check;
    EXECUTE format('ALTER TABLE public.company_products ADD CONSTRAINT company_products_category_check CHECK (category IN (%s))', nuova_lista);

    RAISE NOTICE 'Nuovo elenco di company_products_category_check: %', valori;
  END IF;
END $$;

-- Verifica: deve comparire 'principio_attivo' nell'elenco
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.company_products'::regclass AND conname = 'company_products_category_check';
