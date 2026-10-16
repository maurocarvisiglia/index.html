-- Registro delle visite commerciali per azienda (report a futura memoria).
-- Stesse policy permissive di company_contacts: l'app scrive con la anon key.
create table if not exists public.company_visite (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  data_visita   date not null default current_date,
  canale        text not null default 'visita',   -- visita | call | videocall | fiera | email | altro
  referente     text,                              -- persona incontrata in azienda
  esito         text,                              -- positivo | interlocutorio | negativo | da_ricontattare
  note          text not null,                     -- corpo del report della visita
  prossimo_passo text,
  prossima_data date,
  autore        text,                              -- chi ha svolto la visita (account/collaboratore)
  created_at    timestamptz not null default now(),
  created_by    text                               -- email di chi ha registrato il report
);

create index if not exists idx_company_visite_company
  on public.company_visite(company_id, data_visita desc);

alter table public.company_visite enable row level security;

create policy company_visite_read  on public.company_visite for select using (true);
create policy company_visite_write on public.company_visite for all    using (true) with check (true);

grant select, insert, update, delete on public.company_visite to anon, authenticated;
