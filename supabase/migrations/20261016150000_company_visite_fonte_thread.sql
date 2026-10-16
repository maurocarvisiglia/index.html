-- Tracciamento automatico scambi email: distinguere le voci scritte dall'agente
-- dalle visite inserite a mano, e poterle aggiornare invece di duplicarle.
alter table public.company_visite add column if not exists fonte text not null default 'manuale';
alter table public.company_visite add column if not exists thread_key text;

-- Idempotenza dell'agente: una sola voce per (azienda, thread) auto-importato.
-- Parziale: le visite manuali (thread_key null) non entrano nel vincolo.
create unique index if not exists uq_company_visite_thread
  on public.company_visite(company_id, thread_key) where thread_key is not null;
