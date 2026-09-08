-- comuni_italiani ha Row Level Security attiva ma ZERO policy definite (verificato
-- l'8/09/2026 via `supabase db query --linked`, confrontando una connessione
-- privilegiata con una chiamata reale via API): senza policy, Postgres nega di
-- default la lettura a chiunque non sia il proprietario della tabella o non abbia
-- BYPASSRLS. Risultato reale osservato: la funzione resolve_locations() (non
-- SECURITY DEFINER, gira con i privilegi del chiamante) risolveva 2542/2621 righe
-- se chiamata con una connessione privilegiata, ma 0/2621 se chiamata dall'app via
-- PostgREST (ruolo anon/authenticated) — la tabella comuni_italiani, per quel
-- ruolo, appariva semplicemente vuota, anche se le 7.904 righe erano presenti e i
-- dati corretti (verificato: "Bologna"/"Vicenza" trovano match esatto quando la
-- query gira con privilegi sufficienti).
--
-- comuni_italiani e' un dato di riferimento pubblico (comuni/province/regioni
-- italiane, nessun dato sensibile) — stesso principio di lettura pubblica gia'
-- usato per le altre tabelle di riferimento di questo progetto (company_groups,
-- company_therapeutic_areas, ecc.). Nessuna scrittura pubblica: solo SELECT.

alter table public.comuni_italiani enable row level security;

drop policy if exists comuni_italiani_read on public.comuni_italiani;
create policy comuni_italiani_read on public.comuni_italiani
  for select using (true);

-- Verifica
do $$
declare
  n_policy integer;
begin
  select count(*) into n_policy from pg_policies where tablename = 'comuni_italiani';
  if n_policy = 0 then
    raise exception 'Nessuna policy creata su comuni_italiani — la migration non ha funzionato.';
  end if;
  raise notice 'comuni_italiani ha ora % policy di lettura.', n_policy;
end $$;
