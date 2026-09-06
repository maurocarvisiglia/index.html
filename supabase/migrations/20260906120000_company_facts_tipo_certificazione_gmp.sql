-- company_facts.tipo ammette solo un piccolo insieme di valori noti
-- (fase_mercato, gruppo, modello_commerciale, pipeline_regolatoria, prodotto),
-- verificato con un inserimento di prova che è stato respinto da
-- "cf_tipo_chk". Serve un valore nuovo per registrare che un'azienda è
-- un'officina autorizzata AIFA alla produzione di principi attivi (API) —
-- un fatto regolatorio/di certificazione, non uno dei cinque esistenti.
--
-- A differenza di PARTE_13 (dove conoscevo l'elenco esatto perché l'avevo
-- scritto io in una sessione precedente), qui l'elenco originale di
-- cf_tipo_chk non è mio e non lo conosco per intero: NON viene riscritto
-- alla cieca. Il blocco sotto legge la definizione attuale del vincolo,
-- estrae i valori ammessi (qualunque sia il formato in cui Postgres li ha
-- normalizzati — IN (...) oppure = ANY (ARRAY[...])) e aggiunge
-- 'certificazione_gmp' SOLO a quell'elenco letto dal vincolo reale.
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

  IF 'certificazione_gmp' = ANY(valori) THEN
    RAISE NOTICE 'certificazione_gmp è già presente, nessuna modifica necessaria.';
  ELSE
    valori := array_append(valori, 'certificazione_gmp');
    SELECT string_agg(quote_literal(v), ', ') INTO nuova_lista FROM unnest(valori) v;

    ALTER TABLE public.company_facts DROP CONSTRAINT cf_tipo_chk;
    EXECUTE format('ALTER TABLE public.company_facts ADD CONSTRAINT cf_tipo_chk CHECK (tipo IN (%s))', nuova_lista);

    RAISE NOTICE 'Nuovo elenco di cf_tipo_chk: %', valori;
  END IF;
END $$;

-- Verifica: deve comparire 'certificazione_gmp' nell'elenco
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.company_facts'::regclass AND conname = 'cf_tipo_chk';
