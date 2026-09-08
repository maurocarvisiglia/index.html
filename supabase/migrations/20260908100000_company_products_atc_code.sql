-- Colonna 'atc_code' su company_products: classificazione ATC (Anatomical
-- Therapeutic Chemical, standard OMS) per i farmaci. A differenza di
-- device_category/regime_farmaco (PARTE_20/22), il dato NON e' gia' presente
-- da qualche parte in questo database — va costruito da uno script esterno
-- (scripts/aifa-registro-prodotti.mjs) che legge la colonna ATC gia'
-- presente nel file Lista_farmaci_equivalenti.csv (uno dei 3 file AIFA gia'
-- scaricati) e la propaga via lookup su active_ingredients_norm a TUTTE le
-- righe farmaco, non solo quelle originate da quel file.
--
-- Qui si crea solo la colonna: il backfill dei dati storici e la scrittura
-- per i nuovi arricchimenti sono responsabilita' dello script, non SQL puro
-- (serve scaricare e parsare un CSV esterno).
--
-- Verificato prima di scrivere questa migration (non un'assunzione): 385
-- coppie principio attivo/ATC distinte nel file, 178 classi ATC a 4 livelli
-- (primi 5 caratteri, es. "R03AK" per broncodilatatori+corticosteroidi
-- inalatori) — il livello a cui aziende con molecole diverse ma stessa
-- classe terapeutica (es. Chiesi/beclometasone-formoterolo R03AK08 vs
-- Orion/budesonide-formoterolo R03AK07) risultano concorrenti veri.

alter table public.company_products
  add column if not exists atc_code text;

comment on column public.company_products.atc_code is
  'Codice ATC (classificazione OMS) per i farmaci, es. R03AK07. NULL per dispositivi medici e righe senza corrispondenza nel lookup principio attivo -> ATC (costruito da scripts/aifa-registro-prodotti.mjs dal file Lista_farmaci_equivalenti.csv). I primi 5 caratteri (es. "R03AK") identificano la classe terapeutica: aziende con lo stesso prefisso ma ATC completo diverso sono concorrenti nella stessa classe, non sullo stesso farmaco esatto.';

create index if not exists idx_company_products_atc_code
  on public.company_products (atc_code)
  where atc_code is not null;

-- Nessuna verifica di conteggio qui: il backfill dei dati avviene fuori da
-- questa migration (script Node, non SQL puro).
