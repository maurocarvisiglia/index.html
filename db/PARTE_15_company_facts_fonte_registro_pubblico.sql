-- company_facts.fonte non ammette 'registro_pubblico' (verificato con un
-- inserimento di prova, respinto da "cf_fonte_chk") — serve per registrare
-- che un fatto viene da un registro governativo (es. elenco AIFA delle
-- officine autorizzate alla produzione di principi attivi), non dal sito
-- ufficiale dell'azienda né da un modello linguistico.
--
-- Stesso approccio prudente di PARTE_14: l'elenco originale di cf_fonte_chk
-- non è mio, quindi non viene riscritto alla cieca. Il blocco legge la
-- definizione attuale del vincolo, estrae i valori ammessi e aggiunge
-- 'registro_pubblico' SOLO a quell'elenco letto dal vincolo reale.
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
  WHERE conrelid = 'public.company_facts'::regclass
    AND conname = 'cf_fonte_chk';

  IF def IS NULL THEN
    RAISE EXCEPTION 'Vincolo cf_fonte_chk non trovato su company_facts — controlla manualmente il nome del vincolo.';
  END IF;

  SELECT array_agg(m[1]) INTO valori
  FROM regexp_matches(def, '''([^'']*)''', 'g') AS m;

  IF valori IS NULL OR array_length(valori, 1) IS NULL THEN
    RAISE EXCEPTION 'Non sono riuscito a leggere i valori ammessi dalla definizione attuale: %', def;
  END IF;

  RAISE NOTICE 'Valori attuali di cf_fonte_chk: %', valori;

  IF 'registro_pubblico' = ANY(valori) THEN
    RAISE NOTICE 'registro_pubblico è già presente, nessuna modifica necessaria.';
  ELSE
    valori := array_append(valori, 'registro_pubblico');
    SELECT string_agg(quote_literal(v), ', ') INTO nuova_lista FROM unnest(valori) v;

    ALTER TABLE public.company_facts DROP CONSTRAINT cf_fonte_chk;
    EXECUTE format('ALTER TABLE public.company_facts ADD CONSTRAINT cf_fonte_chk CHECK (fonte IN (%s))', nuova_lista);

    RAISE NOTICE 'Nuovo elenco di cf_fonte_chk: %', valori;
  END IF;
END $$;

-- Verifica: deve comparire 'registro_pubblico' nell'elenco
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.company_facts'::regclass AND conname = 'cf_fonte_chk';
