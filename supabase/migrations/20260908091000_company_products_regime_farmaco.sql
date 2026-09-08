-- Colonna 'regime_farmaco' su company_products, per distinguere farmaci
-- ospedalieri (Classe H AIFA) da farmaci rimborsati SSN/farmacia (Classe A +
-- equivalenti). L'etichetta AIFA originale viene gia' letta dallo script di
-- import (scripts/aifa-registro-prodotti.mjs) ma finora finiva SOLO dentro
-- source_proof come testo libero — stesso identico caso gia' risolto per
-- company_products.device_category (PARTE_20).
--
-- "Da banco" (OTC) resta fuori da questa colonna: Classe A/H riguardano il
-- rimborso SSN, non l'obbligo di prescrizione — non abbiamo mai importato la
-- Classe C AIFA (farmaci non rimborsati/OTC), servirebbe una fonte nuova.
--
-- NESSUN nuovo download: il dato e' gia' in database (8.081 righe farmaco:
-- 4.616 Classe A + 1.133 Classe H + 2.332 Equivalenti, verificato prima di
-- scrivere questa migration), si tratta solo di estrarlo da source_proof.

alter table public.company_products
  add column if not exists regime_farmaco text;

comment on column public.company_products.regime_farmaco is
  'ospedaliero (Classe H AIFA) o rimborsato_ssn (Classe A + equivalenti AIFA), estratto da source_proof. NULL per dispositivi medici e altre fonti.';

update public.company_products
set regime_farmaco = 'ospedaliero'
where fonte = 'registro_pubblico'
  and source_proof ilike 'Classe H AIFA%'
  and regime_farmaco is null;

update public.company_products
set regime_farmaco = 'rimborsato_ssn'
where fonte = 'registro_pubblico'
  and (source_proof ilike 'Classe A AIFA%' or source_proof ilike 'Equivalenti AIFA%')
  and regime_farmaco is null;

create index if not exists idx_company_products_regime_farmaco
  on public.company_products (regime_farmaco)
  where regime_farmaco is not null;

-- Verifica: la migration si rifiuta di riuscire a meta'.
do $$
declare
  popolate integer;
begin
  select count(*) into popolate from public.company_products where regime_farmaco is not null;
  if popolate < 7500 then
    raise exception 'regime_farmaco popolata solo per % righe, attese almeno 7.500 — controllare il pattern di estrazione.', popolate;
  end if;
  raise notice 'company_products.regime_farmaco pronta: % righe popolate.', popolate;
end $$;
