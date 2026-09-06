-- company_products.fonte non ammette una fonte per i registri pubblici
-- ufficiali (AIFA: Classe A, Classe H, Lista farmaci equivalenti) — dato
-- strutturato dal governo, non "ricerca web" (che presuppone un'estrazione
-- testuale con rischio di errore) ne' "manuale". Serve un valore dedicato per
-- distinguerlo chiaramente nell'interfaccia e nei log.
--
-- Nessuna riga esistente viene toccata: si allarga solo l'insieme ammesso.
-- Il nome del constraint viene trovato dinamicamente (non assunto), per non
-- fallire se Postgres l'ha generato con un nome diverso da quello atteso.

DO $$
DECLARE
  nome_vincolo text;
BEGIN
  SELECT conname INTO nome_vincolo
  FROM pg_constraint
  WHERE conrelid = 'public.company_products'::regclass
    AND pg_get_constraintdef(oid) ILIKE '%fonte%';

  IF nome_vincolo IS NULL THEN
    RAISE EXCEPTION 'Nessun vincolo CHECK su fonte trovato in company_products — controlla manualmente.';
  END IF;

  EXECUTE format('ALTER TABLE public.company_products DROP CONSTRAINT %I', nome_vincolo);
  ALTER TABLE public.company_products ADD CONSTRAINT company_products_fonte_check
    CHECK (fonte IN ('sito_ufficiale', 'ricerca_web', 'market_radar', 'manuale', 'registro_pubblico'));
END $$;

-- Verifica
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.company_products'::regclass AND pg_get_constraintdef(oid) ILIKE '%fonte%';
