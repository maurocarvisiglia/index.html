-- Store Manager come ruolo separato da Field Sales Manager/Sales Specialist —
-- richiesto da Mauro il 14/09/2026 dopo aver visto il report "Market
-- Intelligence — Benchmark di riferimento per Area Manager" con dentro
-- LUXOTTICA S.R.L. "Store Manager" (personale di negozio ottica, RAL 37k) mappato
-- su canonical_role "Field Sales Manager" — lo stesso ruolo usato per i veri
-- Area Manager/Field Sales Manager Life Sciences (field B2B verso
-- ospedali/farmacie/cliniche). "C'e' dentro uno store Manager che non e' un
-- area manager Pharma. Va messo come categoria a parte" — stesso principio
-- gia' applicato piu' volte in questa sessione (Addetto Vendita, Odontotecnico,
-- Quality Control Analyst...): non si cancella l'alias, si crea un
-- canonical_role preciso cosi' che nel selettore ruoli del Report Builder
-- compaia come riga propria, deselezionabile senza perdere gli altri ruoli
-- commerciali veri.
--
-- Resta in functional_area='commercial' (non si nasconde silenziosamente: il
-- responsabile di un punto vendita e' comunque un ruolo commerciale) ma con
-- un canonical_role tutto suo, cosi' non pesa piu' sulla mediana RAL e sul
-- conteggio annunci degli Area Manager/Field Sales Manager veri.
--
-- Verificato con query dirette: 12 annunci reali con titolo "Store Manager" e
-- varianti (Assistant/Ottico), oggi su "Field Sales Manager" (9) o "Sales
-- Specialist" (3) — aziende reali: Luxottica (negozi ottica, 9), Lama/Lama
-- group (negozi ottica, 2), Business Solution (1). Nessuna di queste e' una
-- vera figura di field force Life Sciences.

insert into public.job_taxonomy (canonical_role, role_family, functional_area, seniority_default, field_hq_default)
select 'Store Manager', 'commercial', 'commercial', null, 'Field'
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Store Manager');

update public.job_aliases
set canonical_role = 'Store Manager'
where canonical_role in ('Field Sales Manager', 'Sales Specialist')
  and alias ~* '(assistant\s+)?store\s*manager';

update public.job_listings
set canonical_role = 'Store Manager', role_family = 'commercial'
where canonical_role in ('Field Sales Manager', 'Sales Specialist')
  and job_title ~* '(assistant\s+)?store\s*manager';

do $$
declare
  n_alias integer;
  n_annunci integer;
begin
  select count(*) into n_alias from public.job_aliases where canonical_role = 'Store Manager';
  select count(*) into n_annunci from public.job_listings where canonical_role = 'Store Manager';
  raise notice 'Store Manager: % alias, % annunci riclassificati.', n_alias, n_annunci;
end $$;
