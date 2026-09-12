-- Insight di mercato raccolti a voce/testo libero dai recruiter — richiesto da
-- Mauro il 12/09/2026: una schermata dove ogni recruiter annota osservazioni
-- di mercato (RAL, benefit, pacchetto economico...) raccolte durante colloqui
-- o contatti con candidati, che arricchiscono la scheda dell'azienda
-- menzionata. Riusa company_facts (stessa tabella dei fatti CORE gia'
-- mostrata nella scheda azienda), non una tabella nuova: e' concettualmente
-- lo stesso tipo di dato (un'osservazione verificabile su un'azienda), solo
-- con fonte='manuale' invece che da script automatico.
--
-- Il nome del candidato NON deve mai finire nel dato salvato, anche se il
-- recruiter lo scrive nel testo libero dettato: la sanificazione avviene
-- lato applicazione (estrazione IA con istruzione esplicita + revisione
-- umana obbligatoria prima del salvataggio) — qui si aggiunge solo il nuovo
-- tipo di fatto e il permesso di scrittura dal client, per questo tipo.

alter table public.company_facts drop constraint cf_tipo_chk;
alter table public.company_facts add constraint cf_tipo_chk check (tipo = any (array[
  'gruppo','prodotto','fase_mercato','modello_commerciale','sito_italiano',
  'pipeline_regolatoria','studio_clinico_italia','certificazione_gmp',
  'studio_clinico_europa','partnership_commerciale','insight_recruiter'
]));

-- company_facts oggi ha solo una policy di lettura pubblica (cf_read) — tutte
-- le altre scritture passano da script con service role, mai dal browser.
-- Qui si apre la scrittura dal client SOLO per tipo='insight_recruiter': gli
-- altri tipi (pipeline CORE, gruppo, certificazioni...) restano scrivibili
-- solo lato server, per non aprire un canale di scrittura incontrollato su
-- dati che oggi sono sempre verificati da pipeline automatiche.
create policy "cf_insert_insight_recruiter" on public.company_facts
  for insert
  to public
  with check (tipo = 'insight_recruiter');

do $$
begin
  raise notice 'Tipo insight_recruiter aggiunto a company_facts, scrittura client abilitata solo per questo tipo.';
end $$;
