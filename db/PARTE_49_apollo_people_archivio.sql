-- =============================================================================
-- ARCHIVIO APOLLO SENZA PERDITE — 28/09/2026
-- =============================================================================
-- Diagnosi del 28/09: nessuna risposta Apollo veniva mai conservata. Della
-- ricerca persone si teneva solo chi combaciava con una regola (~1 persona su
-- 4, vedi company_workforce); di organizations/enrich 9 campi su ~40; di
-- people/match 5. Tutto il resto andava perso, e non si poteva nemmeno sapere
-- cosa.
--
-- Principio: OGNI campo restituito da Apollo si conserva. I campi noti vanno in
-- colonna; quelli non previsti in `extra` (jsonb), mai scartati. L'inventario
-- apollo_campi_visti registra ogni percorso di campo incontrato, cosi' un campo
-- nuovo di Apollo compare li' invece di sparire.
--
-- Piano Supabase gratuito (500 MB, 283 usati al 28/09): la ricerca persone
-- vale ~300k righe, quindi e' normalizzata. L'oggetto `organization` annidato
-- in ogni persona e' quasi identico per tutta un'azienda: si salva una volta
-- per variante (apollo_people_org) e la persona lo richiama con un'impronta.
-- Le varianti diverse dentro la stessa azienda sono proprio il segnale dei
-- domini condivisi (es. lafarmacia.it, 35 aziende) — per questo si tengono.
--
-- company_workforce resta la tabella letta dal front-end, ma diventa un
-- DERIVATO di apollo_people_raw, ricostruibile con scripts/organico-classifica.mjs.
-- =============================================================================

-- ── Ricerca persone (mixed_people/api_search, gratuita) ─────────────────────
create table if not exists public.apollo_people_org (
  impronta      text primary key,              -- sha1 del jsonb, 12 caratteri
  nome          text,
  payload       jsonb not null,                -- l'oggetto organization completo
  primo_visto_il timestamptz not null default now()
);

create table if not exists public.apollo_people_raw (
  company_id            uuid not null references public.companies(id) on delete cascade,
  apollo_person_id      text not null,
  first_name            text,
  last_name_obfuscated  text,
  title                 text,
  last_refreshed_at     timestamptz,
  has_email             boolean,
  has_city              boolean,
  has_state             boolean,
  has_country           boolean,
  has_direct_phone      text,                  -- 'si' | 'forse' | testo originale se diverso
  org_impronta          text references public.apollo_people_org(impronta),
  extra                 jsonb,                 -- campi non previsti: mai persi
  primo_visto_il        timestamptz not null default now(),
  ultimo_visto_il       timestamptz not null default now(),
  primary key (company_id, apollo_person_id)
);
create index if not exists apollo_people_raw_person_idx on public.apollo_people_raw (apollo_person_id);

create table if not exists public.apollo_people_scarico (
  company_id        uuid primary key references public.companies(id) on delete cascade,
  dominio           text not null,
  total_entries     integer,                   -- persone dichiarate da Apollo in Italia
  scaricate         integer not null default 0,
  pagine            integer not null default 0, -- ultima pagina completata: si riprende da qui
  completo          boolean not null default false,
  esito             text not null check (esito in ('in_corso', 'completo', 'zero_risultati', 'errore')),
  errore            text,
  risposta_extra    jsonb,                     -- chiavi di primo livello oltre people/total_entries
  iniziato_il       timestamptz not null default now(),
  aggiornato_il     timestamptz not null default now()
);

-- ── organizations/enrich e people/match (a crediti) — risposta intera ───────
create table if not exists public.apollo_organizations_raw (
  company_id        uuid primary key references public.companies(id) on delete cascade,
  dominio           text not null,
  apollo_org_id     text,
  nome_apollo       text,
  abbinamento_ok    boolean not null,          -- false = nome non plausibile: conservato lo stesso
  payload           jsonb not null,            -- risposta completa
  ricevuto_il       timestamptz not null default now()
);

create table if not exists public.apollo_people_match_raw (
  apollo_person_id  text primary key,
  company_id        uuid references public.companies(id) on delete set null,
  email_status      text,
  payload           jsonb not null,            -- risposta completa
  ricevuto_il       timestamptz not null default now()
);

-- ── Registro di ogni chiamata (anche fallita): crediti, frequenza, errori ──
create table if not exists public.apollo_chiamate (
  id            bigint generated always as identity primary key,
  endpoint      text not null,
  company_id    uuid,
  chiave        text,                          -- dominio, id persona, pagina...
  http_status   integer,
  esito         text not null,                 -- ok | crediti_esauriti | rate_limit | errore
  errore        text,
  fatta_il      timestamptz not null default now()
);
create index if not exists apollo_chiamate_endpoint_idx on public.apollo_chiamate (endpoint, fatta_il desc);

-- ── Inventario dei campi: cosa Apollo restituisce, cosa estraiamo ───────────
create table if not exists public.apollo_campi_visti (
  endpoint        text not null,
  percorso        text not null,               -- es. organization.funding_events[].amount
  tipo            text not null,
  volte           bigint not null default 0,
  esempio         text,
  estratto_in     text,                        -- dove lo portiamo (tabella.colonna), NULL = solo archiviato
  primo_visto_il  timestamptz not null default now(),
  ultimo_visto_il timestamptz not null default now(),
  primary key (endpoint, percorso)
);

create or replace function public.apollo_registra_campi(campi jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.apollo_campi_visti (endpoint, percorso, tipo, volte, esempio)
  select c->>'endpoint', c->>'percorso', c->>'tipo', (c->>'volte')::bigint, c->>'esempio'
  from jsonb_array_elements(campi) c
  on conflict (endpoint, percorso) do update
    set volte = apollo_campi_visti.volte + excluded.volte,
        tipo = excluded.tipo,
        esempio = coalesce(excluded.esempio, apollo_campi_visti.esempio),
        ultimo_visto_il = now();
$$;
revoke all on function public.apollo_registra_campi(jsonb) from public, anon, authenticated;

-- Mappa di cio' che il codice estrae oggi (verificato nel sorgente il 28/09).
insert into public.apollo_campi_visti (endpoint, percorso, tipo, estratto_in) values
  ('mixed_people/api_search', 'people[].id',    'string', 'company_workforce.apollo_person_id'),
  ('mixed_people/api_search', 'people[].title', 'string', 'company_workforce.titolo_originale'),
  ('mixed_people/api_search', 'total_entries',  'number', 'companies.dipendenti'),
  ('organizations/enrich', 'organization.annual_revenue', 'number', 'companies.fatturato_range'),
  ('organizations/enrich', 'organization.short_description', 'string', 'companies.descrizione_aziendale'),
  ('organizations/enrich', 'organization.linkedin_url', 'string', 'companies.linkedin_url'),
  ('organizations/enrich', 'organization.organization_headcount_twelve_month_growth', 'number', 'companies.crescita_dipendenti_12m'),
  ('organizations/enrich', 'organization.keywords[]', 'string', 'companies.apollo_keywords'),
  ('organizations/enrich', 'organization.industry', 'string', 'companies.apollo_industry'),
  ('organizations/enrich', 'organization.industries[]', 'string', 'companies.apollo_industries'),
  ('organizations/enrich', 'organization.departmental_head_count.*', 'number', 'company_department_headcount'),
  ('people/match', 'person.email', 'string', 'company_contacts.email'),
  ('people/match', 'person.name', 'string', 'company_contacts.nome'),
  ('people/match', 'person.title', 'string', 'company_contacts.ruolo'),
  ('people/match', 'person.linkedin_url', 'string', 'company_contacts.linkedin_url'),
  ('people/match', 'person.email_status', 'string', 'company_contacts.verificato')
on conflict (endpoint, percorso) do update set estratto_in = excluded.estratto_in;

alter table public.apollo_people_org        enable row level security;
alter table public.apollo_people_raw        enable row level security;
alter table public.apollo_people_scarico    enable row level security;
alter table public.apollo_organizations_raw enable row level security;
alter table public.apollo_people_match_raw  enable row level security;
alter table public.apollo_chiamate          enable row level security;
alter table public.apollo_campi_visti       enable row level security;
-- nessuna policy: solo service role (script). Il front-end legge i derivati.

-- ── Viste di controllo ──────────────────────────────────────────────────────
create or replace view public.v_organico_titoli_non_mappati
with (security_invoker = on) as
select lower(trim(r.title))            as titolo,
       count(*)                        as persone,
       count(distinct r.company_id)    as aziende,
       array_agg(distinct c.sector_v2) as settori
from public.apollo_people_raw r
join public.companies c on c.id = r.company_id
left join public.company_workforce w
  on w.company_id = r.company_id and w.apollo_person_id = r.apollo_person_id
where w.company_id is null
group by lower(trim(r.title));

create or replace view public.v_apollo_campi_non_estratti
with (security_invoker = on) as
select endpoint, percorso, tipo, volte, esempio, ultimo_visto_il
from public.apollo_campi_visti
where estratto_in is null and volte > 0;
