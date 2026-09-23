-- Sincronizzazione CRM SoftHiring — richiesta da Mauro il 23/09/2026: importare
-- come Account SoftHiring le aziende di LS Job Intelligence che hanno almeno un
-- contatto nominativo con email, con i loro contatti e la descrizione aziendale.
--
-- softhiring_account_id traccia l'id restituito da SoftHiring alla creazione
-- dell'Account: senza questa colonna, ogni rilancio dello script dovrebbe
-- ritrovare l'account per NOME (rischio di errore 409 su nomi duplicati, o di
-- abbinare l'azienda sbagliata su nomi simili) invece di sapere con certezza
-- "questa azienda e' gia' stata creata, id X, aggiungi solo i contatti nuovi".
-- Stesso principio giA' seguito per l'anti-duplicati interno (iva/sito), qui
-- applicato all'id di un sistema esterno.
alter table public.companies add column if not exists softhiring_account_id integer;

create index if not exists companies_softhiring_account_id_idx
  on public.companies (softhiring_account_id) where softhiring_account_id is not null;

comment on column public.companies.softhiring_account_id is
  'ID dell''Account creato su SoftHiring CRM per questa azienda (via API pubblica). NULL se non ancora sincronizzata.';
