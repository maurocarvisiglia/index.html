-- Campo "Account" sulle aziende — richiesto da Mauro il 22/09/2026: le 3 liste
-- (Mauro/Caterina/Sofia, ~350 aziende ciascuna, con nominativo+email, bilanciate
-- per ricerche aperte e dimensione) appena costruite devono restare visibili e
-- filtrabili direttamente in LS Job Intelligence, non solo nei file consegnati.
--
-- Valori chiusi su un CHECK (stesso principio gia' in uso per fonte/entity_type):
-- solo le 3 persone reali, mai un valore libero che degenera in variazioni di
-- battitura ("Mauro"/"mauro "/"MAURO").
alter table public.companies add column account text;
alter table public.companies add constraint companies_account_chk
  check (account is null or account in ('Mauro', 'Caterina', 'Sofia'));

create index companies_account_idx on public.companies (account) where account is not null;

comment on column public.companies.account is
  'Persona del team a cui e'' assegnata questa azienda per l''attivita'' commerciale (Mauro/Caterina/Sofia) — null se non ancora assegnata.';
