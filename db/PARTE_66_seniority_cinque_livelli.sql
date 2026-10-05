-- =============================================================================
-- SENIORITY: DA 11 VALORI A 5 LIVELLI — 05/10/2026
-- =============================================================================
-- Richiesto da Mauro: troppe categorie da "entry level" a "lead". La scala
-- diventa: entry_level, specialist, senior_specialist, manager, lead.
--
--   associate, internship        -> entry_level   (i tirocini mal etichettati -> specialist)
--   senior_manager               -> manager
--   expert                       -> senior_specialist (esperti senza gestione di persone)
--   director, vp                 -> lead
--   "Direttore/Direttrice" di farmacia -> manager (PRIMA di director -> lead)
--
-- Elimina anche la colonna legacy job_listings.seniority (Junior/Middle/Senior/...):
-- copia ridotta e spesso contraddittoria di seniority_v2, 1.858 vuoti su 3.506,
-- nessuna vista o funzione la usa. Copia di sicurezza dei valori salvata a parte
-- (dati-passate/backup-seniority-prima-del-5-livelli-2026-10-05.json).
-- =============================================================================

update public.job_listings set seniority_v2 = 'manager'
 where seniority_v2 = 'director'
   and (job_title ~* '^\s*direttor\w*\s*/\s*direttric' or job_title ~* 'direttor\w*\s+di\s+farmacia');

update public.job_listings set seniority_v2 = case when job_title ~* 'tirocin|stage|intern' then 'entry_level' else 'specialist' end
 where seniority_v2 = 'internship';

update public.job_listings set seniority_v2 = 'entry_level' where seniority_v2 = 'associate';
update public.job_listings set seniority_v2 = 'manager' where seniority_v2 = 'senior_manager';
update public.job_listings set seniority_v2 = 'senior_specialist' where seniority_v2 = 'expert';
update public.job_listings set seniority_v2 = 'lead' where seniority_v2 in ('director', 'vp');

alter table public.job_listings drop column if exists seniority;
