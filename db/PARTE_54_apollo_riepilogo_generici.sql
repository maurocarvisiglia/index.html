-- =============================================================================
-- RIEPILOGO ARCHIVIO: PERSONE CON RUOLO GENERICO — 28/09/2026
-- =============================================================================
-- 'generico_non_classificabile' (employee, manager, consultant isolati) e'
-- una funzione dichiarata, non una classificazione vera: il front-end la mostra
-- a parte, cosi' la percentuale "con funzione" non si gonfia.
-- =============================================================================

drop materialized view if exists public.mv_apollo_riepilogo;
create materialized view public.mv_apollo_riepilogo as
select
  (select count(*) from public.apollo_people_scarico)                                   as aziende_scaricate,
  (select count(*) from public.apollo_people_scarico where esito = 'completo')          as scarichi_completi,
  (select count(*) from public.apollo_people_scarico where esito = 'in_corso')          as scarichi_in_corso,
  (select count(*) from public.apollo_people_scarico where esito = 'zero_risultati')    as scarichi_zero,
  (select count(*) from public.apollo_people_scarico where esito = 'errore')            as scarichi_errore,
  (select count(*) from public.apollo_people_raw)                                       as persone_archiviate,
  (select count(*) from public.v_apollo_people_attribuite)                              as persone_attribuite,
  (select count(*) from public.v_apollo_people_attribuite r join public.company_workforce w
     on w.company_id = r.company_id and w.apollo_person_id = r.apollo_person_id)        as persone_classificate,
  (select count(*) from public.apollo_organizations_raw)                                as organizzazioni_archiviate,
  (select count(*) from public.apollo_people_match_raw)                                 as match_archiviati,
  (select count(*) from (select apollo_person_id from public.apollo_people_raw
     group by 1 having count(distinct company_id) > 1) x)                               as persone_in_piu_aziende,
  (select count(*) from public.apollo_domini_titolari)                                  as domini_condivisi,
  (select count(*) from public.apollo_domini_titolari where company_id is null)         as domini_senza_titolare,
  (select count(*) from (select apollo_person_id from public.company_workforce
     group by 1 having count(distinct company_id) > 1) x)                               as persone_doppie_in_organico,
  (select count(*) from public.v_apollo_people_attribuite r
     left join public.company_workforce w on w.company_id = r.company_id and w.apollo_person_id = r.apollo_person_id
     where w.company_id is null and r.title is not null and trim(r.title) <> '')        as persone_con_titolo_non_mappate,
  (select count(*) from public.company_workforce where funzione = 'generico_non_classificabile') as persone_generiche,
  now()                                                                                 as calcolato_il;

revoke all on public.mv_apollo_riepilogo from anon, authenticated;
grant select on public.mv_apollo_riepilogo to anon, authenticated;
