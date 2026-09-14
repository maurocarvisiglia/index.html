-- Archivio benchmark macro (aderenza terapeutica, spesa per classe, quota
-- equivalenti/biosimilari...) da fonti pubbliche istituzionali (AIFA/OsMed,
-- Egualia/Nomisma...) — richiesto da Mauro il 14/09/2026 dopo aver valutato
-- IQVIA/Egualia/OsMed come fonti per Rumors & Market Insight: questi dati
-- sono benchmark statistici aggregati (es. "il 52,2% dei pazienti asma/BPCO
-- ha bassa aderenza"), non eventi puntuali (nomine, M&A, partnership) come
-- market_rumors — schema separato, aggiornamento manuale/annuale (i rapporti
-- di origine uscono una volta l'anno), non un pipeline giornaliero.
--
-- Stessa disciplina anti-allucinazione di tutta la famiglia CORE: ogni riga
-- porta una citazione verificata ("prova") contro il testo scaricato
-- davvero e l'URL/pagina del documento di origine — mai un numero
-- trascritto a memoria o dedotto senza controllo diretto della fonte.
--
-- Scrittura SOLO da script/mano con service role (stesso schema di
-- market_rumors): nessuna policy di insert per il client.

create table if not exists public.market_benchmarks (
  id uuid primary key default gen_random_uuid(),
  fonte text not null,               -- es. 'AIFA · Rapporto OsMed 2024'
  fonte_url text not null,
  anno int not null,                 -- anno del rapporto/dato di riferimento
  ambito text not null default 'nazionale',  -- 'nazionale' oppure nome regione
  indicatore text not null,          -- es. 'aderenza_bassa_asma_bpco'
  valore numeric not null,
  unita text not null,               -- '%','mln_eur','eur_procapite','ddd_1000ab_die'...
  descrizione text not null,         -- frase discorsiva di contesto, in italiano
  prova text not null,               -- citazione esatta verificata nel documento scaricato
  pagina int,                        -- pagina del PDF/documento, se pertinente
  rilevato_il timestamptz not null default now(),
  inserito_da text not null default 'manuale'
);

-- Stesso indicatore/fonte/anno/ambito non va duplicato: un aggiornamento
-- dello stesso dato (es. rilettura piu' accurata) sovrascrive la riga, non
-- la affianca.
create unique index if not exists idx_market_benchmarks_dedup
  on public.market_benchmarks (fonte, anno, ambito, indicatore);
create index if not exists idx_market_benchmarks_indicatore on public.market_benchmarks (indicatore);

alter table public.market_benchmarks enable row level security;

create policy "mb_read" on public.market_benchmarks
  for select
  to public
  using (true);

do $$
begin
  raise notice 'Tabella market_benchmarks creata, lettura pubblica, scrittura solo manuale/service role.';
end $$;
