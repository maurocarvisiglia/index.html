-- L'indice parziale di PARTE_72 non e' usabile come target di ON CONFLICT da
-- PostgREST (errore 42P10): l'upsert dell'agente posta falliva e non scriveva
-- nulla. Lo sostituiamo con un indice unico PIENO su (company_id, thread_key):
-- i NULL sono distinti in Postgres, quindi le visite manuali (thread_key null)
-- non vanno mai in conflitto tra loro.
drop index if exists public.uq_company_visite_thread;
create unique index if not exists uq_company_visite_thread
  on public.company_visite(company_id, thread_key);
