-- =============================================================================
-- SEGNALI DA SPERIMENTAZIONE CLINICA (ClinicalTrials.gov) — 04/10/2026
-- =============================================================================
-- Esito della Fase 1 del test Bio Research: gli studi clinici danno segnali
-- utili ai recruiter (fase III che parte in Italia, area terapeutica nuova,
-- studi interrotti, studi di dispositivi medici). Dato pubblico e gratuito
-- (API v2 di ClinicalTrials.gov), mai nomi di persone.
--
-- Tre tabelle:
--   company_ct_sponsor_alias   — come l'azienda compare come sponsor su CT.gov
--                                (il nome e' spesso la capogruppo estera). 'escluso'
--                                blocca falsi abbinamenti noti (es. Italfarmaco S.A).
--   company_trial_signals      — uno studio per riga, con il segnale derivato.
--   company_trial_scan_log     — ultima scansione per azienda: serve alla rotazione
--                                alfabetica (50 aziende a notte).
-- =============================================================================

create table if not exists public.company_ct_sponsor_alias (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  alias       text not null,
  stato       text not null default 'confermato' check (stato in ('confermato', 'escluso')),
  nota        text,
  created_at  timestamptz not null default now(),
  unique (company_id, alias)
);

create table if not exists public.company_trial_signals (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  nct_id               text not null,
  sponsor_ct           text,
  abbinamento          text not null check (abbinamento in ('confermato', 'probabile')),
  titolo               text,
  tipo_studio          text,
  fase                 text[],
  stato                text,
  tipo_intervento      text[],
  condizioni           text[],
  area_terapeutica     text,
  data_inizio          date,
  fine_primaria        date,
  enrollment           integer,
  n_centri_italia      integer not null default 0,
  n_centri_totali      integer not null default 0,
  perche_interrotto    text,
  tipo_segnale         text not null check (tipo_segnale in
                         ('fase3_italia', 'fase2_italia', 'device_italia', 'solo_estero', 'interrotto')),
  affidabilita_segnale text not null check (affidabilita_segnale in ('alto', 'medio', 'basso')),
  area_nuova           boolean not null default false,
  segnale_note         text,
  visto_il             timestamptz not null default now(),
  aggiornato_il        timestamptz not null default now(),
  unique (company_id, nct_id)
);

create index if not exists idx_trial_signals_company on public.company_trial_signals (company_id);
create index if not exists idx_trial_signals_tipo on public.company_trial_signals (tipo_segnale, affidabilita_segnale);
create index if not exists idx_trial_signals_inizio on public.company_trial_signals (data_inizio desc);

create table if not exists public.company_trial_scan_log (
  company_id   uuid primary key references public.companies(id) on delete cascade,
  scanned_at   timestamptz not null default now(),
  esito        text not null check (esito in ('ok', 'nessuno_studio', 'errore')),
  n_studi      integer not null default 0,
  nota         text
);

alter table public.company_ct_sponsor_alias enable row level security;
alter table public.company_trial_signals enable row level security;
alter table public.company_trial_scan_log enable row level security;

create policy "ct_alias_read" on public.company_ct_sponsor_alias for select using (true);
create policy "ct_signals_read" on public.company_trial_signals for select using (true);
create policy "ct_scanlog_read" on public.company_trial_scan_log for select using (true);

grant select on public.company_ct_sponsor_alias, public.company_trial_signals, public.company_trial_scan_log to anon, authenticated;

-- Abbinamenti sponsor incerti, da confermare o escludere con un alias.
create or replace view public.v_company_trial_abbinamenti_da_verificare as
select s.company_id, c.name as azienda, s.sponsor_ct, count(*) as n_studi,
       max(s.data_inizio) as ultimo_avvio
from public.company_trial_signals s
join public.companies c on c.id = s.company_id
where s.abbinamento = 'probabile'
group by s.company_id, c.name, s.sponsor_ct;

grant select on public.v_company_trial_abbinamenti_da_verificare to anon, authenticated;
