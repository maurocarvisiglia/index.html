-- Piano di contatto trimestrale — richiesto da Mauro il 28/09/2026: una pagina
-- in LS Job Intelligence, visibile solo a lui, che mostra le aziende del suo
-- account da contattare, organizzate per mese (blocco di priorita') e settimana
-- (tema dell'attivita': Assessment&Coaching / Marketing CV / Advisory /
-- Presentazione personale). Tabella propria invece di colonne su `companies`
-- perche' e' un piano legato a un preciso trimestre (Q4 2026): tenerlo separato
-- rende ovvio quando andra' rigenerato per il trimestre successivo, invece di
-- lasciare campi "mese"/"settimana" ambigui e permanenti sull'anagrafica azienda.
create table public.piano_contatto_trimestrale (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mese text not null check (mese in ('Ottobre', 'Novembre', 'Dicembre')),
  settimana int not null check (settimana between 1 and 4),
  tema text not null,
  punteggio numeric,
  creato_il timestamptz not null default now(),
  -- Un'azienda compare una sola volta per mese: evita duplicati se il piano
  -- viene rigenerato (es. dopo aver caricato nuovi annunci, come anticipato
  -- da Mauro) senza prima svuotare la tabella.
  unique (company_id, mese)
);

create index piano_contatto_mese_settimana_idx on public.piano_contatto_trimestrale (mese, settimana);

alter table public.piano_contatto_trimestrale enable row level security;
-- Lettura pubblica come le altre tabelle di sola consultazione (company_workforce,
-- company_facts) — la pagina che la mostra e' gia' visibile solo a Mauro lato
-- applicazione (controllo su _currentUser.email), qui serve solo che il browser
-- possa leggerla con la chiave anonima come fa per tutto il resto dell'app.
create policy "pct_read" on public.piano_contatto_trimestrale for select using (true);

comment on table public.piano_contatto_trimestrale is
  'Piano di contatto trimestrale (Q4 2026) per le aziende dell''account Mauro: mese/settimana/tema di attivita'' commerciale, con il punteggio di priorita'' usato per ordinarle.';
