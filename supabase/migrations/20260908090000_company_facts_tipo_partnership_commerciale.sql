-- company_facts.tipo non ammette 'partnership_commerciale' — serve per
-- registrare partnership/co-sviluppo tra aziende che il matching per
-- principio attivo/dispositivo NON PUO' scoprire da solo: il registro AIFA
-- registra chi detiene l'AIC (autorizzazione all'immissione in commercio) in
-- Italia, non chi ha co-sviluppato il farmaco a livello globale.
--
-- Caso reale che ha reso necessario questo tipo (07/09/2026, verificato):
-- Nubeqa (darolutamide) risulta in company_products SOLO sotto Bayer (unico
-- titolare AIC in Italia) — Orion Pharma, che lo ha co-sviluppato e per cui
-- e' il principale prodotto, non ha alcuna riga corrispondente. trovaConcorrenti()
-- non trovera' mai questa relazione dal solo overlap di prodotto: va annotata
-- a mano, quando nota, come fatto CORE separato — mai mescolata nell'elenco
-- "concorrenti" (che deve restare affidabile: solo sovrapposizione verificata).
--
-- Stesso approccio prudente delle precedenti (PARTE_14/15/19): l'elenco
-- originale di questo vincolo non e' mio, quindi non viene riscritto alla
-- cieca. Il blocco legge la definizione attuale, estrae i valori ammessi e
-- aggiunge 'partnership_commerciale' SOLO a quell'elenco letto dal vincolo
-- reale.

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

  IF 'partnership_commerciale' = ANY(valori) THEN
    RAISE NOTICE 'partnership_commerciale e'' gia'' presente, nessuna modifica necessaria.';
  ELSE
    valori := array_append(valori, 'partnership_commerciale');
    SELECT string_agg(quote_literal(v), ', ') INTO nuova_lista FROM unnest(valori) v;

    ALTER TABLE public.company_facts DROP CONSTRAINT cf_tipo_chk;
    EXECUTE format('ALTER TABLE public.company_facts ADD CONSTRAINT cf_tipo_chk CHECK (tipo IN (%s))', nuova_lista);

    RAISE NOTICE 'Nuovo elenco di cf_tipo_chk: %', valori;
  END IF;
END $$;

-- Verifica: deve comparire 'partnership_commerciale' nell'elenco
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.company_facts'::regclass AND conname = 'cf_tipo_chk';
