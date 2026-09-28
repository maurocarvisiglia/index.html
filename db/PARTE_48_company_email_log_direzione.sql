-- Estende company_email_log (creata in 20260928110000, ancora vuota) per
-- tracciare anche le risposte ricevute dai clienti, non solo le email
-- inviate — richiesto da Mauro il 28/09/2026 insieme al contatore delle
-- comunicazioni fatte nel mese.
--
-- "destinatario_email" viene rinominata "controparte_email": per una riga
-- 'inviata' e' il destinatario, per una riga 'ricevuta' e' il mittente —
-- il nome originale sarebbe stato fuorviante per le risposte.
alter table public.company_email_log rename column destinatario_email to controparte_email;

alter table public.company_email_log
  add column direzione text not null default 'inviata' check (direzione in ('inviata', 'ricevuta'));

-- Il nome del vincolo riflette ancora la colonna ORIGINALE (destinatario_email):
-- rinominare una colonna in Postgres non rinomina i vincoli che la usano.
alter table public.company_email_log drop constraint company_email_log_company_id_destinatario_email_data_invio_key;
alter table public.company_email_log
  add constraint company_email_log_company_controparte_data_direzione_key
  unique (company_id, controparte_email, data_invio, direzione);

comment on column public.company_email_log.direzione is
  'inviata = email scritta da Mauro (Posta Inviata); ricevuta = risposta del cliente (Posta in Arrivo).';

-- Vista di comodo aggiornata: ultimo contatto in ENTRAMBE le direzioni (per
-- sapere se e quando il cliente ha risposto, non solo se gli abbiamo scritto),
-- piu' il conteggio delle sole email INVIATE nel mese corrente (il "contatore
-- di comunicazioni fatte" richiesto — solo le nostre, non le risposte, perche'
-- misura l'attivita' commerciale svolta, non quella del cliente).
-- DROP invece di CREATE OR REPLACE: cambiano i nomi delle colonne della vista
-- (ultimo_contatto_il -> ultimo_invio_il/ultima_risposta_il), e Postgres non
-- permette di rinominare le colonne di una vista con un semplice REPLACE.
drop view public.v_company_ultimo_contatto;
create view public.v_company_ultimo_contatto as
select
  company_id,
  max(data_invio) filter (where direzione = 'inviata') as ultimo_invio_il,
  (array_agg(oggetto order by data_invio desc) filter (where direzione = 'inviata'))[1] as ultimo_invio_oggetto,
  max(data_invio) filter (where direzione = 'ricevuta') as ultima_risposta_il,
  count(*) filter (where direzione = 'inviata' and data_invio >= date_trunc('month', now())) as comunicazioni_mese_corrente,
  count(*) filter (where direzione = 'inviata') as email_inviate_totali,
  count(*) filter (where direzione = 'ricevuta') as email_ricevute_totali
from public.company_email_log
group by company_id;
