-- Aziende senza sede in Italia — richiesto da Mauro il 10/09/2026 dopo aver
-- notato titolari AIC esteri (es. "Biocryst Ireland Limited", "Bracco
-- International B.V.") comparire come righe autonome nelle liste/ricerche
-- aziende e nelle tabelle concorrenti, quando in realta' sono solo il
-- contenitore anagrafico di un dato di prodotto importato da un registro
-- pubblico (AIFA) — non hanno organico, sede o presenza italiana da
-- mostrare. "Non devono comparire nell'elenco ma devono solo accorpare dati
-- che arrivano da fonti straniere": il dato prodotto resta (non si tocca
-- company_products), l'azienda-contenitore non compare piu' come riga
-- autonoma in ricerca/liste/tabelle concorrenti.
--
-- Riusa la stessa logica gia' in produzione in classificaPaeseAzienda()
-- (index.html), usata oggi solo per la lista "aziende senza sito web":
-- province/region valorizzate o "Italia/Italy"/forma legale italiana nel
-- nome -> italia; forma legale estera o parola di paese estero nel nome ->
-- estero; altrimenti "sconosciuto" (resta visibile, mai un'esclusione
-- silenziosa su un caso ambiguo). Include la stessa lista di eccezioni
-- verificate a mano il 07/09/2026 (aziende senza segnale testuale ma
-- confermate estere una per una).

alter table public.companies
  add column if not exists sede_italia boolean not null default true;

comment on column public.companies.sede_italia is
  'Falso per aziende senza sede in Italia (tipicamente titolari AIC esteri da AIFA) — escluse da ricerca/liste/tabelle concorrenti, ma i loro company_products restano e continuano a contare nei calcoli aggregati. Stessa classificazione di classificaPaeseAzienda() in index.html.';

create index if not exists idx_companies_sede_italia
  on public.companies (sede_italia)
  where sede_italia = false;

with classificazione as (
  select
    id,
    case
      when name in (
        'BELPHARMA s.a.','BoF Careers','Cis Bio International','Ethyx Pharmaceuticals',
        'GEN.ORPH Sas','Mitem Pharma','Olpha As','Panmedica','REPUBLIC M!','Substipharm','Theravia'
      ) then 'estero'
      when province is not null or region is not null then 'italia'
      when name ~* '\yitalia\y' or name ~* '\yitaly\y'
        or coalesce(ragione_sociale,'') ~* '\yitalia\y' or coalesce(ragione_sociale,'') ~* '\yitaly\y'
        then 'italia'
      when name ~* '\ys\.?r\.?l\.?\y' or name ~* '\ys\.?p\.?a\.?\y'
        or coalesce(ragione_sociale,'') ~* '\ys\.?r\.?l\.?\y' or coalesce(ragione_sociale,'') ~* '\ys\.?p\.?a\.?\y'
        then 'italia'
      when name ~* '\y(ireland|irel|netherlands|nederland|deutschland|germany|france|espana|spain|belgium|belgie|hungary|ungheria|malta|luxembourg|switzerland|austria|poland|denmark|sweden|norway|finland|romania|czech|slovak|croatia|greece|portugal|laboratoire|laboratoires|handels|vertrieb)\y'
        or coalesce(ragione_sociale,'') ~* '\y(ireland|irel|netherlands|nederland|deutschland|germany|france|espana|spain|belgium|belgie|hungary|ungheria|malta|luxembourg|switzerland|austria|poland|denmark|sweden|norway|finland|romania|czech|slovak|croatia|greece|portugal|laboratoire|laboratoires|handels|vertrieb)\y'
        then 'estero'
      when name ~* '\y(ltd|limited|gmbh|b\.?v\.?|n\.?v\.?|a\.?g\.?|plc|llc|inc\.?|kft|sarl|s\.?a\.?r\.?l\.?|aps|a/s|oy|ab|eeig|ehf|s\.?r\.?o\.?|bvba|pty|pte|oü|sagl|s\.?a\.?|s\.?l\.?|lda)\y'
        or coalesce(ragione_sociale,'') ~* '\y(ltd|limited|gmbh|b\.?v\.?|n\.?v\.?|a\.?g\.?|plc|llc|inc\.?|kft|sarl|s\.?a\.?r\.?l\.?|aps|a/s|oy|ab|eeig|ehf|s\.?r\.?o\.?|bvba|pty|pte|oü|sagl|s\.?a\.?|s\.?l\.?|lda)\y'
        then 'estero'
      else 'sconosciuto'
    end as paese
  from public.companies
  where is_active and merged_into is null
)
update public.companies c
set sede_italia = false
from classificazione cl
where c.id = cl.id and cl.paese = 'estero';

do $$
declare
  n integer;
begin
  select count(*) into n from public.companies where sede_italia = false;
  raise notice 'companies.sede_italia = false per % aziende.', n;
end $$;
