-- Completamento di 20260910150000: la regex usata li' cercava "alle vendite"
-- (plurale) e mancava la variante singolare "alla vendita" ("ADDETTO/A ALLA
-- VENDITA", 6 annunci Lama S.R.L. + l'alias corrispondente) — stesso
-- ruolo, stessa causa, solo una forma grammaticale diversa non coperta dal
-- pattern precedente. Verificato con query diretta subito dopo la prima
-- migration: 6 annunci e 1 alias erano rimasti su "Sales Specialist".

update public.job_aliases
set canonical_role = 'Addetto Vendita'
where canonical_role in ('Sales Specialist', 'Sales Representative')
  and alias ~* 'addett[a-z/]*\s*all[ae]\s+vendit';

update public.job_listings
set canonical_role = 'Addetto Vendita', role_family = 'commercial'
where canonical_role in ('Sales Specialist', 'Sales Representative')
  and job_title ~* 'addett[a-z/]*\s*all[ae]\s+vendit';

do $$
declare
  n_annunci integer;
begin
  select count(*) into n_annunci from public.job_listings where canonical_role = 'Addetto Vendita';
  raise notice 'Addetto Vendita: % annunci totali dopo il completamento.', n_annunci;
end $$;
