-- Addetto Vendita come ruolo separato dalle Figure Commerciali — richiesto da
-- Mauro il 10/09/2026 dopo aver visto il report "Figure Commerciali Medical
-- Device" dominato da Luxottica (44% degli annunci, RAL 25k) perche' "Addetto/a
-- Vendite" (personale di negozio: ottica, farmacia, punto vendita) era mappato
-- sullo stesso canonical_role "Sales Specialist" usato per le vere figure
-- commerciali B2B (Sales Specialist/Rep che vendono a ospedali/cliniche).
-- "Gli addetti alle vendite non dovrebbero essere messi nelle figure
-- commerciali, dovrebbe essere una voce di scelta": stesso principio gia'
-- applicato piu' volte in questa sessione (Odontotecnico, Quality Control
-- Analyst, ecc.) — non si cancella l'alias, si crea un canonical_role
-- preciso cosi' che nel selettore ruoli del Report Builder compaia come riga
-- propria, deselezionabile senza perdere gli altri ruoli commerciali veri.
--
-- Resta in functional_area='commercial' (non si nasconde silenziosamente: il
-- venditore di negozio e' comunque un'area commerciale) ma con un
-- canonical_role tutto suo, cosi' il selettore lo mostra come opzione
-- separata invece di sommarlo a Sales Specialist/Representative.
--
-- Verificato con query dirette: 39 annunci reali con titolo "Addetto/a
-- Vendite" e varianti, 38 oggi su "Sales Specialist" e 1 su "Sales
-- Representative", aziende reali: Luxottica (negozi ottica), farmacie
-- (Italfarmacia, Farmacrimi), Eureka Lab, Onme Vision, Lolato.

insert into public.job_taxonomy (canonical_role, role_family, functional_area, seniority_default, field_hq_default)
select 'Addetto Vendita', 'commercial', 'commercial', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Addetto Vendita');

update public.job_aliases
set canonical_role = 'Addetto Vendita'
where canonical_role in ('Sales Specialist', 'Sales Representative')
  and alias ~* 'addett[a-z/]*\s*(alle\s+)?vendit';

update public.job_listings
set canonical_role = 'Addetto Vendita', role_family = 'commercial'
where canonical_role in ('Sales Specialist', 'Sales Representative')
  and job_title ~* 'addett[a-z/]*\s*(alle\s+)?vendit';

do $$
declare
  n_alias integer;
  n_annunci integer;
begin
  select count(*) into n_alias from public.job_aliases where canonical_role = 'Addetto Vendita';
  select count(*) into n_annunci from public.job_listings where canonical_role = 'Addetto Vendita';
  raise notice 'Addetto Vendita: % alias, % annunci riclassificati.', n_alias, n_annunci;
end $$;
