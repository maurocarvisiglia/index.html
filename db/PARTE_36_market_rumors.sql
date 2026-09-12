-- Rumors e Market Insight da fonti esterne — richiesto da Mauro il 12/09/2026:
-- "attingere da fonti esterne per ampliare Rumors e Market Insight...Farmindustria
-- etc." Nuova tabella, non company_facts: un articolo di stampa di settore puo'
-- menzionare piu' aziende o nessuna in particolare (un rumor di mercato generale,
-- es. "il mercato dei dispositivi medici cresce del 5%", non e' attribuibile a
-- una singola azienda e non va scartato solo per questo).
--
-- Stessa disciplina anti-allucinazione gia' in uso per company_facts/company_
-- therapeutic_areas (vedi core-recupero-gratuito.mjs): ogni riga porta una
-- citazione verificata contro il testo scaricato davvero e l'URL dell'articolo
-- di origine — mai un fatto dedotto o riassunto senza prova verificabile.
--
-- Scrittura SOLO da script con service role (stesso schema di tutte le
-- pipeline CORE automatiche): nessuna policy di insert per il client, a
-- differenza di company_facts.insight_recruiter che invece e' alimentato a
-- mano dai recruiter dall'app.

create table if not exists public.market_rumors (
  id uuid primary key default gen_random_uuid(),
  fonte text not null,
  fonte_url text,
  titolo text not null,
  sintesi text not null,
  url text not null,
  prova text not null,
  tipo_segnale text not null check (tipo_segnale = any(array[
    'personale','m_and_a','prodotto','partnership','finanziario','regolatorio','altro'
  ])),
  lingua text,
  pubblicato_il timestamptz,
  rilevato_il timestamptz not null default now(),
  company_id_principale uuid references public.companies(id) on delete set null,
  companies_menzionate uuid[] not null default '{}',
  worker text
);

-- L'URL dell'articolo e' la chiave di deduplicazione: la stessa fonte va
-- ricontrollata ogni giorno, ma un articolo gia' visto non va rielaborato
-- (ne' ririchiesto all'IA, inutile spesa, ne' riscritto due volte).
create unique index if not exists idx_market_rumors_url on public.market_rumors (url);
create index if not exists idx_market_rumors_company_principale on public.market_rumors (company_id_principale);
create index if not exists idx_market_rumors_pubblicato on public.market_rumors (pubblicato_il desc);
create index if not exists idx_market_rumors_menzionate on public.market_rumors using gin (companies_menzionate);

alter table public.market_rumors enable row level security;

create policy "mr_read" on public.market_rumors
  for select
  to public
  using (true);

do $$
begin
  raise notice 'Tabella market_rumors creata, lettura pubblica, scrittura solo da script con service role.';
end $$;
