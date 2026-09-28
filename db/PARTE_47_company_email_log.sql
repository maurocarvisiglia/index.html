-- Log email inviate — richiesto da Mauro il 28/09/2026: sapere quando un'azienda
-- e' stata contattata l'ultima volta, per non proporla di nuovo nel Piano di
-- Contatto trimestrale se e' gia' stata scritta di recente. Alimentato ogni
-- giorno da scripts/scansione-posta-inviata.ps1 (Outlook COM, Posta Inviata)
-- + scripts/associa-posta-inviata-giornaliera.mjs (abbinamento dominio->azienda
-- e scrittura), non da un trigger o da un webhook — stesso schema "script
-- pianificato locale" gia' in uso per Jarvis e i cron Apollo/organico.
--
-- Tabella di LOG (una riga per email), non solo un campo "ultimo contatto" su
-- companies: cosi' si puo' ricostruire la cronologia (quante volte, quando)
-- invece di perdere il dettaglio a ogni sovrascrittura, e il vincolo unique
-- rende l'importazione giornaliera idempotente (si puo' ri-scansionare la
-- stessa finestra di giorni senza creare duplicati).
create table public.company_email_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  destinatario_email text not null,
  oggetto text,
  data_invio timestamptz not null,
  importato_il timestamptz not null default now(),
  unique (company_id, destinatario_email, data_invio)
);

create index company_email_log_company_idx on public.company_email_log (company_id, data_invio desc);

alter table public.company_email_log enable row level security;
-- Lettura pubblica come le altre tabelle di sola consultazione (company_facts,
-- piano_contatto_trimestrale) — la scrittura resta riservata alla service role
-- dello script di importazione (nessuna policy insert/update per anon/authenticated).
create policy "cel_read" on public.company_email_log for select using (true);

comment on table public.company_email_log is
  'Log delle email inviate da Mauro (Posta Inviata Outlook) abbinate per dominio a un''azienda del database. Importato giornalmente, una riga per email.';

-- Vista di comodo: ultimo contatto per azienda, usata dal Piano di Contatto e
-- dalla scheda azienda. Una query PostgREST non puo' fare MAX/GROUP BY da sola,
-- quindi si pre-aggrega qui invece di scaricare tutto il log lato client.
create or replace view public.v_company_ultimo_contatto as
select
  company_id,
  max(data_invio) as ultimo_contatto_il,
  (array_agg(oggetto order by data_invio desc))[1] as ultimo_contatto_oggetto,
  count(*) as email_totali
from public.company_email_log
group by company_id;

comment on view public.v_company_ultimo_contatto is
  'Ultimo contatto email per azienda, aggregato da company_email_log.';
