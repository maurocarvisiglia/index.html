-- =============================================================================
-- DOMINI CONDIVISI: UN SOLO TITOLARE PER DOMINIO — 28/09/2026
-- =============================================================================
-- Apollo cerca le persone per dominio: 105 domini sono usati da 275 aziende
-- (lafarmacia.it da 35, gvmnet.it da 9, gsk.com da 5...) e ognuna riceveva la
-- stessa lista. 37.514 persone risultavano in piu' aziende.
--
-- Dentro un dominio Apollo attribuisce a tutte le persone la STESSA
-- organizzazione (es. "GSK" per tutte le 2.814 di gsk.com): quel nome dice di
-- chi sono, non come dividerle. Per ogni dominio condiviso si sceglie quindi
-- un titolare — l'azienda il cui nome corrisponde all'organizzazione Apollo
-- (parole distintive, non "S.p.A."/"Italia"/"Farmacia") — e a parita' la scheda
-- aggiornata piu' di recente. Se nessuna corrisponde (lafarmacia.it ->
-- "Farmacia Ninci", gvmnet.it -> "GVM Care & Research") il titolare e' NULL:
-- nessuna scheda riceve un organico che non e' suo.
--
-- Si ricalcola a ogni classificazione e a ogni raccolta giornaliera, sempre
-- dall'ultimo scarico: decide il dato piu' recente. Le persone restano
-- archiviate per ogni azienda; cambia solo cosa diventa company_workforce.
-- Logica in scripts/lib/apollo-domini.mjs.
-- =============================================================================

create table if not exists public.apollo_domini_titolari (
  dominio       text primary key,
  company_id    uuid references public.companies(id) on delete set null, -- NULL = nessuna scheda corrisponde
  org_nome      text,                      -- organizzazione Apollo dell'ultimo scarico
  punteggio     numeric,
  motivo        text not null,
  candidati     jsonb not null,            -- [{company_id, name, punteggio}] per trasparenza
  deciso_il     timestamptz not null default now()
);
alter table public.apollo_domini_titolari enable row level security;

create or replace view public.v_fe_apollo_domini as
select d.dominio, d.company_id as titolare_id, c.name as titolare, d.org_nome,
       d.punteggio, d.motivo, d.candidati, d.deciso_il
from public.apollo_domini_titolari d
left join public.companies c on c.id = d.company_id;

-- Persone "attribuite": quelle delle aziende titolari (o di domini non
-- condivisi). E' la base di tutti i conteggi, cosi' nessuna persona e' contata
-- una volta per ogni scheda che condivide il dominio.
create or replace view public.v_apollo_people_attribuite as
select r.*
from public.apollo_people_raw r
join public.apollo_people_scarico s on s.company_id = r.company_id
left join public.apollo_domini_titolari d on d.dominio = s.dominio
where d.dominio is null or d.company_id = r.company_id;

-- Riepilogo: si aggiungono i domini condivisi e le persone contate due volte
-- DOPO l'attribuzione (dovrebbero scendere a zero).
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
  now()                                                                                 as calcolato_il;

drop materialized view if exists public.mv_organico_titoli_non_mappati;
create materialized view public.mv_organico_titoli_non_mappati as
select lower(trim(coalesce(r.title, '(senza titolo)'))) as titolo,
       count(*)                                          as persone,
       count(distinct r.company_id)                      as aziende,
       array_agg(distinct coalesce(c.sector_v2, '(vuoto)')) as settori
from public.v_apollo_people_attribuite r
join public.companies c on c.id = r.company_id
left join public.company_workforce w
  on w.company_id = r.company_id and w.apollo_person_id = r.apollo_person_id
where w.company_id is null
group by 1;
create index if not exists mv_otnm_persone_idx on public.mv_organico_titoli_non_mappati (persone desc);

-- Privilegi di default di Supabase = tutto ad anon: si tolgono e si ridà la
-- sola lettura (vedi 20260928145000_apollo_archivio_permessi.sql).
revoke all on public.apollo_domini_titolari, public.v_apollo_people_attribuite, public.v_fe_apollo_domini,
  public.mv_apollo_riepilogo, public.mv_organico_titoli_non_mappati
from anon, authenticated;
grant select on public.v_fe_apollo_domini, public.mv_apollo_riepilogo, public.mv_organico_titoli_non_mappati
to anon, authenticated;
