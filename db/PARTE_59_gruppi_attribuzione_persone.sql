-- =============================================================================
-- GRUPPI: A QUALE SOCIETA' DEL GRUPPO VA OGNI PERSONA — 28/09/2026
-- =============================================================================
-- Deciso da Mauro su Fresenius, "segui questa logica" per tutti i gruppi:
--   - si scarica una volta per tutto il gruppo
--   - se le societa' hanno nomi diversi, ognuna tiene i propri dipendenti: la
--     persona va alla societa' il cui nome corrisponde all'organizzazione
--     Apollo della persona (Fresenius Kabi -> "Fresenius Kabi")
--   - a parita', e quando nessuna corrisponde, vince la capogruppo
--     (Fresenius Medical Care e FMC Italia -> Fresenius Italia; la scheda
--     "Fresenius medical care" resta senza dipendenti; SIS-TER li avrebbe solo
--     se Apollo avesse persone "SIS-TER")
--   - la capogruppo mostra l'intero numero del gruppo (v_fe_gruppo_organico)
-- L'attribuzione la calcola scripts/lib/apollo-gruppi.mjs a ogni
-- classificazione e la scrive qui; le viste la leggono.
-- =============================================================================

create table if not exists public.apollo_gruppo_attribuzione (
  gruppo_id         uuid not null references public.company_groups(id) on delete cascade,
  apollo_person_id  text not null,
  proprietario_id   uuid not null references public.companies(id) on delete cascade,
  fonte_company_id  uuid not null references public.companies(id) on delete cascade,
  org_nome          text,
  primary key (gruppo_id, apollo_person_id)
);
alter table public.apollo_gruppo_attribuzione enable row level security;
revoke all on public.apollo_gruppo_attribuzione from anon, authenticated;

-- Fresenius: capogruppo Fresenius Italia.
update public.company_groups set capogruppo_id = 'd9214d41-ed79-4457-b36a-c5d8f2741502', capogruppo_deciso_il = now()
 where id = '91e97075-141a-4ec2-8a5a-c5ff98aec588'
   and exists (select 1 from public.companies where id = 'd9214d41-ed79-4457-b36a-c5d8f2741502'
               and name = 'FRESENIUS ITALIA SPA' and company_group_id = '91e97075-141a-4ec2-8a5a-c5ff98aec588');

-- Persone attribuite: per i membri di un gruppo con capogruppo vale
-- apollo_gruppo_attribuzione; per gli altri la regola dei domini condivisi.
drop materialized view if exists public.mv_apollo_riepilogo;
drop materialized view if exists public.mv_organico_titoli_non_mappati;
drop view if exists public.v_apollo_people_attribuite;

create view public.v_apollo_people_attribuite as
with membri as (
  select c.id as company_id, g.id as gruppo_id
  from public.companies c join public.company_groups g on g.id = c.company_group_id and g.capogruppo_id is not null
),
di_gruppo as (
  select distinct on (a.gruppo_id, a.apollo_person_id) r.*, a.proprietario_id
  from public.apollo_gruppo_attribuzione a
  join public.apollo_people_raw r on r.company_id = a.fonte_company_id and r.apollo_person_id = a.apollo_person_id
),
fuori_gruppo as (
  select r.*, r.company_id as proprietario_id
  from public.apollo_people_raw r
  join public.apollo_people_scarico s on s.company_id = r.company_id
  left join membri m on m.company_id = r.company_id
  left join public.apollo_domini_titolari d on s.dominio = any (d.domini)
  where m.company_id is null and (d.dominio is null or d.company_id = r.company_id)
)
select * from di_gruppo
union all
select * from fuori_gruppo;

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
join public.companies c on c.id = a.proprietario_id
left join public.company_workforce w
  on w.company_id = a.proprietario_id and w.apollo_person_id = a.apollo_person_id
where w.company_id is null
group by 1;
create index if not exists mv_otnm_persone_idx on public.mv_organico_titoli_non_mappati (persone desc);

-- Organico dell'intero gruppo, per la scheda della capogruppo (e il rimando
-- dalle societa' legate): somma di tutte le societa' del gruppo.
create or replace view public.v_fe_gruppo_organico as
select g.id as gruppo_id, g.name as gruppo, g.capogruppo_id, w.funzione, w.ambito,
       count(*) as conteggio, count(distinct w.company_id) as societa
from public.company_groups g
join public.companies c on c.company_group_id = g.id and c.is_active and c.merged_into is null
join public.company_workforce w on w.company_id = c.id
where g.capogruppo_id is not null
group by g.id, g.name, g.capogruppo_id, w.funzione, w.ambito;

create or replace view public.v_fe_gruppo_societa as
select g.id as gruppo_id, c.id as company_id, c.name, (c.id = g.capogruppo_id) as capogruppo,
       (select count(*) from public.company_workforce w where w.company_id = c.id) as persone
from public.company_groups g
join public.companies c on c.company_group_id = g.id and c.is_active and c.merged_into is null
where g.capogruppo_id is not null;

revoke all on public.v_apollo_people_attribuite, public.mv_apollo_riepilogo, public.mv_organico_titoli_non_mappati,
  public.v_fe_gruppo_organico, public.v_fe_gruppo_societa
from anon, authenticated;
grant select on public.mv_apollo_riepilogo, public.mv_organico_titoli_non_mappati,
  public.v_fe_gruppo_organico, public.v_fe_gruppo_societa
to anon, authenticated;
