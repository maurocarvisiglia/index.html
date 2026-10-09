-- Totale dei profili Apollo per azienda: serve a riconoscere i dati non attendibili
-- (profili piu' numerosi dei dipendenti noti: tipico di un dominio condiviso col gruppo).
create or replace view public.v_company_workforce_totale as
select company_id, count(*)::int as totale
from public.company_workforce
group by company_id;
grant select on public.v_company_workforce_totale to anon, authenticated;
