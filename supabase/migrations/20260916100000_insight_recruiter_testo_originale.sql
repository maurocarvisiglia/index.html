-- Testo originale (pre-anonimizzazione) degli Insight Recruiter — richiesto da
-- Mauro il 16/09/2026: vuole poter rivedere in "Ultimi inseriti" anche il
-- testo così come scritto/dettato dal recruiter, non solo la versione finale
-- che finisce sulla scheda azienda (piu' sintetica/riscritta dall'IA).
--
-- Tabella SEPARATA da company_facts, per costruzione: company_facts alimenta
-- le schede azienda e (in prospettiva) i report generati per i clienti, e ha
-- una policy di lettura pubblica pensata per quello. Il testo originale può
-- contenere il nome del candidato prima della redazione — Mauro ha confermato
-- (16/09/2026) che il nome va comunque tolto anche qui, ma il resto del testo
-- va conservato com'è scritto, senza la riscrittura/sintesi che l'IA applica
-- al testo che finisce in company_facts. Tenerlo in una tabella propria, mai
-- letta da nessuna funzione di scheda/report, evita che possa "risalire" per
-- errore in un contesto pubblico in futuro — è un confine strutturale, non
-- solo una promessa applicativa.
create table public.insight_recruiter_originali (
  id             uuid primary key default gen_random_uuid(),
  company_fact_id uuid not null references public.company_facts(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,

  testo_originale text not null,
  worker          text,
  rilevato_il     timestamptz not null default now()
);

create index insight_recruiter_originali_company_idx on public.insight_recruiter_originali (company_id);
create index insight_recruiter_originali_fact_idx on public.insight_recruiter_originali (company_fact_id);

comment on table public.insight_recruiter_originali is
  'Testo originale (nome del candidato gia'' tolto, ma non riscritto/sintetizzato) degli Insight Recruiter. Mai letta da scheda azienda o report — solo dalla pagina Insight Recruiter.';

alter table public.insight_recruiter_originali enable row level security;

-- Stesso modello di fiducia di company_facts.cf_insert_insight_recruiter: la
-- scrittura passa dal client con la chiave pubblica, non da uno script con
-- service role. La lettura resta pubblica come nel resto dell'app (nessuna
-- policy per-utente esiste oggi in questo progetto) — l'isolamento che conta
-- è che NESSUNA funzione di scheda azienda o di report interroga questa
-- tabella, non la policy RLS in sé.
create policy "iro_insert" on public.insight_recruiter_originali
  for insert
  to public
  with check (true);

create policy "iro_read" on public.insight_recruiter_originali
  for select
  to public
  using (true);

do $$
begin
  raise notice 'Tabella insight_recruiter_originali creata: testo pre-anonimizzazione, isolata da company_facts.';
end $$;
