-- Correzione al report "Area Manager", richiesta da Mauro il 14/09/2026 dopo
-- aver visto Synlab tra i risultati nonostante avesse gia' chiesto di
-- escluderlo dal report. Investigato: nessun meccanismo lo escludeva (la
-- blocklist aziende agisce solo sulla CREAZIONE di nuove aziende in fase di
-- import, mai riletta dal Report Builder in fase di query). Il filtro IQR
-- (gia' simmetrico, verificato: esclude sia gli alti che i bassi anomali in
-- trimmedRal/filterRalOutlierListings) non c'entra: i valori di Synlab
-- (28-38k) non sono outlier statistici, cadono nel grosso della
-- distribuzione — il problema e' categoriale, non statistico.
--
-- SYNLAB — azienda Life Sciences legittima (Diagnostics/Healthcare
-- Services): il problema e' solo il ruolo "Coordinatore Retail (Punti
-- Prelievo)" mappato su canonical_role "Area Manager Commercial" — e' un
-- coordinamento interno di punti prelievo, non una figura di field sales
-- B2B paragonabile a un vero Area Manager farmaceutico/medicale. Stesso
-- pattern gia' applicato a Store Manager (14/09/2026): nuovo canonical_role
-- dedicato, 5 annunci riclassificati.
--
-- NOTA CORRETTIVA (14/09/2026, stessa giornata): la prima versione di
-- questo file includeva anche Solenis in companies_blocklist + cancellazione
-- di azienda/annunci dal database — Mauro ha chiarito subito dopo: "gli ho
-- chiesto solo di escluderle dal report. non dal database". Quella parte e'
-- stata annullata a mano (azienda e 30 annunci Solenis ripristinati) e
-- rimossa da qui: l'esclusione di aziende specifiche da un report va gestita
-- SOLO a livello di query/prompt del Report Builder (nuovo filtro
-- "escludi_aziende" in index.html), mai cancellando dati dal database.

insert into public.job_taxonomy (canonical_role, role_family, functional_area, seniority_default, field_hq_default)
select 'Coordinatore Retail', 'commercial', 'commercial', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Coordinatore Retail');

update public.job_aliases
set canonical_role = 'Coordinatore Retail'
where canonical_role = 'Area Manager Commercial'
  and alias ~* 'coordinat\w*\s+retail';

update public.job_listings
set canonical_role = 'Coordinatore Retail', role_family = 'commercial'
where canonical_role = 'Area Manager Commercial'
  and job_title ~* 'coordinat\w*\s+retail';

do $$
declare
  n_coord integer;
begin
  select count(*) into n_coord from public.job_listings where canonical_role = 'Coordinatore Retail';
  raise notice 'Coordinatore Retail: % annunci riclassificati.', n_coord;
end $$;
