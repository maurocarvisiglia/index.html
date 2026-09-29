-- =============================================================================
-- DOMINI CONDIVISI ANCHE FRA DOMINI DIVERSI — 28/09/2026
-- =============================================================================
-- Dopo la prima attribuzione restavano 10.928 persone doppie in organico: la
-- stessa organizzazione Apollo risponde a piu' domini (it.gsk.com e gsk.com,
-- recordati.it e recordati.com, unilever.it e unilever.com...). 36 coppie di
-- schede, liste sovrapposte all'85-95%.
--
-- Un gruppo ora si forma per stesso dominio OPPURE per persone in comune
-- (almeno meta' della lista piu' corta), e ha un solo titolare con la stessa
-- regola di prima (scripts/lib/apollo-domini.mjs). La riga resta chiavata sul
-- dominio principale; `domini` elenca tutti quelli del gruppo.
-- =============================================================================

alter table public.apollo_domini_titolari add column if not exists domini text[];
update public.apollo_domini_titolari set domini = array[dominio] where domini is null;
alter table public.apollo_domini_titolari alter column domini set not null;
create index if not exists apollo_domini_titolari_domini_idx on public.apollo_domini_titolari using gin (domini);

-- Coppie di schede con persone in comune: base per unire i gruppi fra domini.
create or replace view public.v_apollo_coppie_sovrapposte
with (security_invoker = on) as
with n as (select company_id, count(*) persone from public.apollo_people_raw group by 1)
select a.company_id as company_a, b.company_id as company_b, count(*) as comuni,
       least(na.persone, nb.persone) as lista_piu_corta
from public.apollo_people_raw a
join public.apollo_people_raw b on b.apollo_person_id = a.apollo_person_id and b.company_id > a.company_id
join n na on na.company_id = a.company_id
join n nb on nb.company_id = b.company_id
group by a.company_id, b.company_id, na.persone, nb.persone;

create or replace view public.v_apollo_people_attribuite as
select r.*
from public.apollo_people_raw r
join public.apollo_people_scarico s on s.company_id = r.company_id
left join public.apollo_domini_titolari d on s.dominio = any (d.domini)
where d.dominio is null or d.company_id = r.company_id;

create or replace view public.v_fe_apollo_domini as
select d.dominio, d.company_id as titolare_id, c.name as titolare, d.org_nome,
       d.punteggio, d.motivo, d.candidati, d.deciso_il, d.domini
from public.apollo_domini_titolari d
left join public.companies c on c.id = d.company_id;

revoke all on public.v_apollo_coppie_sovrapposte, public.v_apollo_people_attribuite, public.v_fe_apollo_domini
from anon, authenticated;
grant select on public.v_fe_apollo_domini to anon, authenticated;
