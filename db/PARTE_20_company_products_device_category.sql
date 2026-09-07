-- Colonna 'device_category' su company_products, per i dispositivi medici del
-- Repertorio Ministero Salute (275.173 righe). Il codice/descrizione CND
-- (Classificazione Nazionale Dispositivi) viene gia' letto dallo script di
-- import (scripts/dispositivi-medici-registro.mjs:260) ma finora finiva SOLO
-- dentro source_proof come testo libero, mai reso una colonna interrogabile —
-- per questo oggi non esiste modo di trovare "aziende con lo stesso tipo di
-- dispositivo" (la scoperta che ha reso possibile 'active_ingredients_norm'
-- per i farmaci, qui mancava l'equivalente).
--
-- NESSUN nuovo download: il dato e' gia' in database, si tratta solo di
-- estrarlo da source_proof con una regex, dove il formato lo permette.
--
-- Verificato prima di scrivere questa migration (non un'assunzione):
--   - formato affidabile su tutte le 275.173 righe, nessun troncamento
--     (lunghezza massima osservata 208 caratteri su un campo da 400)
--   - 263.278 righe (95,7%) hanno davvero una sezione CND in coda (due
--     em-dash " — " nel testo); le altre ~11.895 non la contenevano nemmeno
--     alla fonte (campo CND vuoto nel registro originale) — si lasciano NULL
--     invece di estrarre per sbaglio il nome del fabbricante come se fosse
--     una categoria.
--   - segnale specifico, non rumoroso: per la categoria CND di un prodotto
--     Steris campione, solo 6 aziende diverse la condividono.

alter table public.company_products
  add column if not exists device_category text;

comment on column public.company_products.device_category is
  'Descrizione CND (Classificazione Nazionale Dispositivi) per i dispositivi medici, estratta da source_proof. NULL per i farmaci (uso active_ingredients_norm) e per le righe dispositivo senza sezione CND nella fonte originale.';

-- Estrazione: tutto cio' che segue l'ULTIMO " — " nel testo, solo dove ne
-- esistono almeno due (altrimenti il testo e' "Repertorio... — Fabbricante: X"
-- senza alcuna sezione CND, ed estrarre comunque prenderebbe il fabbricante).
update public.company_products
set device_category = trim(regexp_replace(source_proof, '^.*—\s*', ''))
where fonte = 'registro_pubblico'
  and source_proof ilike 'Repertorio Dispositivi Medici%'
  and source_proof ~ '—.*—'
  and device_category is null;

create index if not exists idx_company_products_device_category
  on public.company_products (device_category)
  where device_category is not null;

-- Verifica: la migration si rifiuta di riuscire a meta'.
do $$
declare
  popolate integer;
begin
  select count(*) into popolate from public.company_products where device_category is not null;
  if popolate < 260000 then
    raise exception 'device_category popolata solo per % righe, attese almeno 260.000 — controllare il pattern di estrazione.', popolate;
  end if;
  raise notice 'company_products.device_category pronta: % righe popolate.', popolate;
end $$;
