-- company_facts.tipo: serve 'studio_clinico_europa'.
--
-- Market Radar ha esteso la raccolta da "trial con centri in Italia" a venti mercati
-- europei. Un Fase 3 aperto in Germania e Spagna ma non in Italia resta un segnale
-- sull'azienda — la patologia che studia e la scala dell'investimento sono le stesse —
-- ma registrarlo come 'studio_clinico_italia' sarebbe scrivere un dato falso.
--
-- Verificato con un inserimento di prova respinto da "cf_tipo_chk" il 06/09/2026.
-- Attenzione: sullo stesso inserimento agisce anche "cf_prova_chk", che pretende `url`
-- quando `prova` e' valorizzata; senza url l'errore di cf_prova_chk arriva per primo e
-- nasconde quello sul tipo.
--
-- Stesso metodo di PARTE_14: l'elenco attuale non viene riscritto alla cieca, si legge
-- dalla definizione reale del vincolo e gli si aggiunge un valore. Nessuna riga
-- esistente viene toccata: si allarga soltanto l'insieme ammesso.

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
    RAISE EXCEPTION 'Vincolo cf_tipo_chk non trovato su company_facts — controlla manualmente il nome del vincolo.';
  END IF;

  SELECT array_agg(m[1]) INTO valori
  FROM regexp_matches(def, '''([^'']*)''', 'g') AS m;

  IF valori IS NULL OR array_length(valori, 1) IS NULL THEN
    RAISE EXCEPTION 'Non sono riuscito a leggere i valori ammessi dalla definizione attuale: %', def;
  END IF;

  RAISE NOTICE 'Valori attuali di cf_tipo_chk: %', valori;

  IF 'studio_clinico_europa' = ANY(valori) THEN
    RAISE NOTICE 'studio_clinico_europa è già presente, nessuna modifica necessaria.';
  ELSE
    valori := array_append(valori, 'studio_clinico_europa');
    SELECT string_agg(quote_literal(v), ', ') INTO nuova_lista FROM unnest(valori) v;

    ALTER TABLE public.company_facts DROP CONSTRAINT cf_tipo_chk;
    EXECUTE format('ALTER TABLE public.company_facts ADD CONSTRAINT cf_tipo_chk CHECK (tipo IN (%s))', nuova_lista);

    RAISE NOTICE 'Nuovo elenco di cf_tipo_chk: %', valori;
  END IF;
END $$;

-- Verifica: deve comparire 'studio_clinico_europa' nell'elenco
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.company_facts'::regclass AND conname = 'cf_tipo_chk';
