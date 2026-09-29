-- =============================================================================
-- ARCHIVIO APOLLO: SOLO LETTURA PER IL FRONT-END — 28/09/2026
-- =============================================================================
-- I privilegi di default di Supabase danno ad anon/authenticated TUTTI i
-- permessi (anche INSERT/UPDATE/DELETE/TRUNCATE) su ogni tabella o vista nuova
-- di public. Sulle tabelle apollo_* la RLS senza policy bloccava gia' tutto,
-- ma le viste v_fe_* girano coi diritti del proprietario: quelle su una sola
-- tabella (v_fe_apollo_campi, v_fe_apollo_organizzazione) erano aggiornabili,
-- e con la chiave anon di index.html si poteva cancellare l'archivio
-- (verificato: DELETE su v_fe_apollo_campi -> HTTP 204).
--
-- Si tolgono tutti i permessi e si ridà la sola lettura alle viste pensate per
-- il front-end. Le tabelle raw e le viste interne restano chiuse.
-- =============================================================================

revoke all on public.apollo_people_org, public.apollo_people_raw, public.apollo_people_scarico,
  public.apollo_organizations_raw, public.apollo_people_match_raw, public.apollo_chiamate,
  public.apollo_campi_visti, public.v_organico_titoli_non_mappati, public.v_apollo_campi_non_estratti,
  public.v_fe_apollo_persone, public.v_fe_apollo_org_varianti, public.v_fe_apollo_scarico,
  public.v_fe_apollo_organizzazione, public.v_fe_apollo_campi, public.v_fe_apollo_chiamate,
  public.mv_apollo_riepilogo, public.mv_organico_titoli_non_mappati
from anon, authenticated;

grant select on public.v_fe_apollo_persone, public.v_fe_apollo_org_varianti, public.v_fe_apollo_scarico,
  public.v_fe_apollo_organizzazione, public.v_fe_apollo_campi, public.v_fe_apollo_chiamate,
  public.mv_apollo_riepilogo, public.mv_organico_titoli_non_mappati
to anon, authenticated;
