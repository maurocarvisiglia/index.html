-- =============================================================================
-- CAPOGRUPPO — 28/09/2026
-- =============================================================================
-- Deciso da Mauro per le societa' diverse dello stesso gruppo: "crei 1 che e'
-- la capogruppo. Le altre sono legate ma solo sulla capogruppo metti l'intero
-- numero". Quindi, per un gruppo con capogruppo:
--   - la capogruppo porta l'organico dell'INTERO gruppo: l'unione delle persone
--     scaricate per tutte le societa' legate, ognuna contata una volta
--   - le societa' legate non hanno organico proprio; nella loro scheda vedono
--     il numero del gruppo, con il rimando alla capogruppo
-- Il gruppo vince sulla regola dei domini condivisi (apollo_domini_titolari):
-- i suoi membri escono da quella logica.
--
-- Applicata a 5 gruppi (GSK, Roche, BMS, IQVIA, Bayer). Fresenius resta fuori
-- in attesa di decisione: il gruppo contiene anche Fresenius Medical Care, che
-- e' un'altra societa' con un altro sito.
-- =============================================================================

alter table public.company_groups add column if not exists capogruppo_id uuid references public.companies(id) on delete set null;
alter table public.company_groups add column if not exists capogruppo_deciso_il timestamptz;

-- "Gsk" non era legata al gruppo Glaxosmithkline.
update public.companies set company_group_id = 'd009aa2f-f2b4-4d63-96ee-699c6ce089e9'
 where id = 'f33c18e9-e618-4e33-8f40-ad5b656eea68' and name = 'Gsk' and company_group_id is null;

update public.company_groups g set capogruppo_id = v.capo, capogruppo_deciso_il = now()
from (values
  ('d009aa2f-f2b4-4d63-96ee-699c6ce089e9'::uuid, 'f33c18e9-e618-4e33-8f40-ad5b656eea68'::uuid),  -- Glaxosmithkline -> Gsk
  ('3785c626-4685-43d0-abf8-97921072bf67'::uuid, 'e3d1cee1-7193-4ee4-9f90-7572a48362a3'::uuid),  -- Roche -> Roche
  ('25709e1d-27cb-42c7-a955-628b55aba927'::uuid, '53376df2-65b8-4552-a296-0fbc925b8025'::uuid),  -- Bristol -> Bristol-Myers Squibb S.r.l.
  ('0f917bcf-5379-43bb-8bd1-7f82b3ab546e'::uuid, '49ff422b-6916-4fe3-abba-597387945cbd'::uuid),  -- Iqvia -> IQVIA
  ('62bc9a29-441c-42f8-9f2f-59e5a5d8bde5'::uuid, '0021d220-5961-4353-8f8c-d5e11df60a6d'::uuid)   -- Bayer -> Bayer
) as v(gruppo, capo)
where g.id = v.gruppo
  and exists (select 1 from public.companies c where c.id = v.capo and c.company_group_id = v.gruppo);

-- La vista cambia colonne: prima via i riepiloghi che la usano, poi la vista.
drop materialized view if exists public.mv_apollo_riepilogo;
drop materialized view if exists public.mv_organico_titoli_non_mappati;
drop view if exists public.v_apollo_people_attribuite;

-- Chi possiede ogni persona archiviata: la capogruppo per i membri di un gruppo
-- con capogruppo, altrimenti la scheda stessa (salvo i domini condivisi, dove
-- vale il titolare). Una riga per (proprietario, persona).
create view public.v_apollo_people_attribuite as
with base as (
  select r.*,
         g.capogruppo_id,
         case when g.capogruppo_id is not null then g.capogruppo_id else r.company_id end as proprietario_id,
         d.dominio as dominio_condiviso, d.company_id as titolare_dominio
  from public.apollo_people_raw r
  join public.companies c on c.id = r.company_id
  left join public.company_groups g on g.id = c.company_group_id and g.capogruppo_id is not null
  join public.apollo_people_scarico s on s.company_id = r.company_id
  left join public.apollo_domini_titolari d on s.dominio = any (d.domini)
)
select distinct on (proprietario_id, apollo_person_id) *
from base
where capogruppo_id is not null or dominio_condiviso is null or titolare_dominio = company_id
order by proprietario_id, apollo_person_id, (company_id = proprietario_id) desc, ultimo_visto_il desc;

create materialized view public.mv_apollo_riepilogo as
select
  (select count(*) from public.apollo_people_scarico)                                   as aziende_scaricate,
  (select count(*) from public.apollo_people_scarico where esito = 'completo')          as scarichi_completi,
  (select count(*) from public.apollo_people_scarico where esito = 'in_corso')          as scarichi_in_corso,
  (select count(*) from public.apollo_people_scarico where esito = 'zero_risultati')    as scarichi_zero,
  (select count(*) from public.apollo_people_scarico where esito = 'errore')            as scarichi_errore,
  (select count(*) from public.apollo_people_raw)                                       as persone_archiviate,
  (select count(*) from public.v_apollo_people_attribuite)                              as persone_attribuite,
  (select count(*) from public.v_apollo_people_attribuite a join public.company_workforce w
     on w.company_id = a.proprietario_id and w.apollo_person_id = a.apollo_person_id)   as persone_classificate,
  (select count(*) from public.apollo_organizations_raw)                                as organizzazioni_archiviate,
  (select count(*) from public.apollo_people_match_raw)                                 as match_archiviati,
  (select count(*) from (select apollo_person_id from public.apollo_people_raw
     group by 1 having count(distinct company_id) > 1) x)                               as persone_in_piu_aziende,
  (select count(*) from public.apollo_domini_titolari)                                  as domini_condivisi,
  (select count(*) from public.apollo_domini_titolari where company_id is null)         as domini_senza_titolare,
  (select count(*) from public.company_groups where capogruppo_id is not null)          as gruppi_con_capogruppo,
  (select count(*) from (select apollo_person_id from public.company_workforce
     group by 1 having count(distinct company_id) > 1) x)                               as persone_doppie_in_organico,
  (select count(*) from public.v_apollo_people_attribuite a
     left join public.company_workforce w on w.company_id = a.proprietario_id and w.apollo_person_id = a.apollo_person_id
     where w.company_id is null and a.title is not null and trim(a.title) <> '')        as persone_con_titolo_non_mappate,
  (select count(*) from public.company_workforce where funzione = 'generico_non_classificabile') as persone_generiche,
  now()                                                                                 as calcolato_il;

create materialized view public.mv_organico_titoli_non_mappati as
select lower(trim(coalesce(a.title, '(senza titolo)'))) as titolo,
       count(*)                                          as persone,
       count(distinct a.proprietario_id)                 as aziende,
       array_agg(distinct coalesce(c.sector_v2, '(vuoto)')) as settori
from public.v_apollo_people_attribuite a
join public.companies c on c.id = a.company_id
left join public.company_workforce w
  on w.company_id = a.proprietario_id and w.apollo_person_id = a.apollo_person_id
where w.company_id is null
group by 1;
create index if not exists mv_otnm_persone_idx on public.mv_organico_titoli_non_mappati (persone desc);

-- Per il front-end: gruppo e capogruppo di ogni scheda legata.
create or replace view public.v_fe_capogruppo as
select c.id as company_id, g.id as gruppo_id, g.name as gruppo, g.capogruppo_id, cp.name as capogruppo
from public.companies c
join public.company_groups g on g.id = c.company_group_id and g.capogruppo_id is not null
join public.companies cp on cp.id = g.capogruppo_id;

revoke all on public.v_apollo_people_attribuite, public.mv_apollo_riepilogo, public.mv_organico_titoli_non_mappati, public.v_fe_capogruppo
from anon, authenticated;
grant select on public.mv_apollo_riepilogo, public.mv_organico_titoli_non_mappati, public.v_fe_capogruppo to anon, authenticated;
