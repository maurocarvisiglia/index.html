-- Colonna 'atc_class' (i primi 5 caratteri di atc_code, es. "R03AK" da
-- "R03AK07"): la classe terapeutica a 4 livelli, usata da trovaConcorrenti()
-- per il terzo livello di concorrenza (stessa classe, molecola diversa —
-- caso reale Chiesi/Foster R03AK08 vs Orion/Fobuler R03AK07, verificato
-- l'8/09/2026 con Mauro).
--
-- Perche' una colonna a parte invece di un filtro "atc_code LIKE 'R03AK%'"
-- in query: verificato con un test reale (non un'assunzione) che un indice
-- btree normale su atc_code NON accelera una ricerca per prefisso sotto la
-- collation di default di Postgres — la query va in timeout (57014) su
-- 8.000+ righe, con o senza scritture concorrenti. Un indice di uguaglianza
-- su una colonna gia' tagliata ai 5 caratteri e' immediato.
--
-- GENERATED ALWAYS: si calcola da sola da atc_code, zero rischio che le due
-- colonne finiscano disallineate (a differenza di scriverla a mano in ogni
-- script che tocca atc_code).

alter table public.company_products
  add column if not exists atc_class text generated always as (left(atc_code, 5)) stored;

comment on column public.company_products.atc_class is
  'Primi 5 caratteri di atc_code (classe terapeutica ATC a 4 livelli), calcolata automaticamente. Usata per il matching "stessa classe, molecola diversa" — un indice di uguaglianza su questa e'' molto piu'' veloce di un LIKE su atc_code.';

create index if not exists idx_company_products_atc_class
  on public.company_products (atc_class)
  where atc_class is not null;

-- Verifica: la colonna generata deve rispecchiare atc_code sulle righe gia' popolate.
do $$
declare
  disallineate integer;
begin
  select count(*) into disallineate
  from public.company_products
  where atc_code is not null and atc_class is distinct from left(atc_code, 5);
  if disallineate > 0 then
    raise exception 'atc_class disallineata da atc_code su % righe — la colonna generata non si sta calcolando correttamente.', disallineate;
  end if;
  raise notice 'company_products.atc_class pronta e allineata ad atc_code.';
end $$;
