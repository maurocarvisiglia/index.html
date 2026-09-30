-- Piano di contatto trimestrale esteso a Sofia e Caterina (30/09/2026), non solo
-- Mauro. Loro non hanno la sincronizzazione automatica con la posta (quella resta
-- solo per Mauro, via Outlook COM sul suo PC): serve quindi un modo MANUALE di
-- segnare un'attivita' come fatta, un tasto che flaggano loro stessi dall'app.
alter table public.piano_contatto_trimestrale
  add column fatto_manualmente boolean not null default false,
  add column fatto_il timestamptz;

comment on column public.piano_contatto_trimestrale.fatto_manualmente is
  'Flag manuale (per chi non ha la sincronizzazione email, es. Sofia/Caterina): true se l''utente ha segnato l''attivita'' come fatta a mano.';

-- Serve una policy di scrittura: finora la tabella era di sola lettura per il
-- browser (scritta solo da script con service role). Ora il tasto "segna come
-- fatta" scrive direttamente dall'app con la chiave anonima. Nessun dato
-- sensibile in questa tabella (solo punteggi/temi/riferimenti azienda), stesso
-- livello di fiducia gia' concesso al resto dell'app interna.
create policy "pct_update_fatto" on public.piano_contatto_trimestrale for update using (true) with check (true);
