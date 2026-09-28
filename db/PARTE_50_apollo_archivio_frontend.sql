-- =============================================================================
-- ARCHIVIO APOLLO VISIBILE NEL FRONT-END — 28/09/2026
-- =============================================================================
-- Richiesto da Mauro: tutto cio' che l'archivio conserva deve essere visibile.
-- Le tabelle *_raw restano chiuse (RLS senza policy); il front-end legge queste
-- viste, che espongono tutto TRANNE i nomi delle persone (first_name,
-- last_name_obfuscated) e le risposte di people/match (email, cronologia
-- lavorativa): stesso principio gia' scritto nella card organico ("mai un
-- nome"), perche' la chiave anon e' dentro index.html.
--
-- Viste senza security_invoker: girano coi diritti del proprietario, cosi'
-- possono leggere le tabelle chiuse ma mostrano solo le colonne scelte qui.
-- =============================================================================

create or replace view public.v_fe_apollo_persone as
select r.company_id, r.apollo_person_id, r.title, r.last_refreshed_at,
       r.has_email, r.has_city, r.has_state, r.has_country, r.has_direct_phone,
       o.nome as org_nome, r.org_impronta, r.extra,
       w.funzione, w.livello, w.archetipo, w.ambito, w.sede,
       r.primo_visto_il, r.ultimo_visto_il
from public.apollo_people_raw r
left join public.apollo_people_org o on o.impronta = r.org_impronta
left join public.company_workforce w
  on w.company_id = r.company_id and w.apollo_person_id = r.apollo_person_id;

create or replace view public.v_fe_apollo_org_varianti as
select r.company_id, o.nome as org_nome, o.impronta, o.payload, count(*) as persone
from public.apollo_people_raw r
join public.apollo_people_org o on o.impronta = r.org_impronta
group by r.company_id, o.nome, o.impronta, o.payload;

create or replace view public.v_fe_apollo_scarico as
select s.*, c.name as azienda, c.sector_v2
from public.apollo_people_scarico s
join public.companies c on c.id = s.company_id;

create or replace view public.v_fe_apollo_organizzazione as
select company_id, dominio, apollo_org_id, nome_apollo, abbinamento_ok, payload, ricevuto_il
from public.apollo_organizations_raw;

create or replace view public.v_fe_apollo_campi as
select endpoint, percorso, tipo, volte, esempio, estratto_in, primo_visto_il, ultimo_visto_il
from public.apollo_campi_visti;

create or replace view public.v_fe_apollo_chiamate as
select endpoint, esito, http_status, count(*) as chiamate, max(fatta_il) as ultima
from public.apollo_chiamate
where fatta_il > now() - interval '30 days'
group by endpoint, esito, http_status;

-- Aggregati pesanti (~300k persone): calcolati una volta e rinfrescati dal
-- classificatore (scripts/organico-classifica.mjs) e dall'importatore.
create materialized view if not exists public.mv_apollo_riepilogo as
select
  (select count(*) from public.apollo_people_scarico)                                   as aziende_scaricate,
  (select count(*) from public.apollo_people_scarico where esito = 'completo')          as scarichi_completi,
  (select count(*) from public.apollo_people_scarico where esito = 'in_corso')          as scarichi_in_corso,
  (select count(*) from public.apollo_people_scarico where esito = 'zero_risultati')    as scarichi_zero,
  (select count(*) from public.apollo_people_scarico where esito = 'errore')            as scarichi_errore,
  (select count(*) from public.apollo_people_raw)                                       as persone_archiviate,
  (select count(*) from public.apollo_people_raw r join public.company_workforce w
     on w.company_id = r.company_id and w.apollo_person_id = r.apollo_person_id)        as persone_classificate,
  (select count(*) from public.apollo_organizations_raw)                                as organizzazioni_archiviate,
  (select count(*) from public.apollo_people_match_raw)                                 as match_archiviati,
  (select count(*) from (select apollo_person_id from public.apollo_people_raw
     group by 1 having count(distinct company_id) > 1) x)                               as persone_in_piu_aziende,
  now()                                                                                 as calcolato_il;

create materialized view if not exists public.mv_organico_titoli_non_mappati as
select lower(trim(coalesce(r.title, '(senza titolo)'))) as titolo,
       count(*)                                          as persone,
       count(distinct r.company_id)                      as aziende,
       array_agg(distinct coalesce(c.sector_v2, '(vuoto)')) as settori
from public.apollo_people_raw r
join public.companies c on c.id = r.company_id
left join public.company_workforce w
  on w.company_id = r.company_id and w.apollo_person_id = r.apollo_person_id
where w.company_id is null
group by 1;
create index if not exists mv_otnm_persone_idx on public.mv_organico_titoli_non_mappati (persone desc);

create or replace function public.apollo_rinfresca_riepiloghi()
returns void language sql security definer set search_path = public set statement_timeout = '300s' as $$
  refresh materialized view public.mv_apollo_riepilogo;
  refresh materialized view public.mv_organico_titoli_non_mappati;
$$;
revoke all on function public.apollo_rinfresca_riepiloghi() from public, anon, authenticated;

grant select on public.v_fe_apollo_persone, public.v_fe_apollo_org_varianti, public.v_fe_apollo_scarico,
  public.v_fe_apollo_organizzazione, public.v_fe_apollo_campi, public.v_fe_apollo_chiamate,
  public.mv_apollo_riepilogo, public.mv_organico_titoli_non_mappati
  to anon, authenticated;
