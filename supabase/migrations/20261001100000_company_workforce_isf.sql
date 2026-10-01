-- =============================================================================
-- COMPANY_WORKFORCE: FUNZIONE DEDICATA PER GLI INFORMATORI SCIENTIFICI — 01/10/2026
-- =============================================================================
-- Richiesto da Mauro dopo l'introduzione del benchmark organico nei report
-- ("quanti ISF trovo in provincia di Bergamo"): il pattern INFORMATORI in
-- scripts/lib/organico-tassonomia.mjs esisteva gia' dal 28/09/2026 ma veniva
-- bucketato dentro 'sales_commercial' insieme a tutto il resto delle vendite —
-- 332 persone su tutto l'archivio (verificato via query diretta), mai isolabili
-- come categoria propria in un report. Nuovo codice 'isf_informatore_scientifico'
-- al livello universale (si applica a qualunque settore, come gia' era
-- INFORMATORI), non un nuovo archetipo.
-- =============================================================================

alter table public.company_workforce drop constraint if exists company_workforce_funzione_check;
alter table public.company_workforce add constraint company_workforce_funzione_check check (funzione in (
  -- livello 1 — universale
  'general_management', 'hr', 'finance_admin', 'legal_compliance', 'it_digital',
  'procurement', 'logistics_supply_chain', 'marketing_communications',
  'sales_commercial', 'isf_informatore_scientifico', 'business_development', 'facilities_maintenance',
  'personale_medico', 'infermieri_oss', 'professioni_sanitarie',
  'engineering_tecnico', 'project_management', 'stage_formazione', 'generico_non_classificabile',
  -- livello 2 — farma/biotech commerciale
  'medical_affairs_msl', 'market_access', 'regulatory_affairs_prodotto',
  'pharmacovigilance', 'clinical_operations_locali', 'patient_support',
  -- livello 2 — produzione / cdmo / chimico
  'produzione_site_operations', 'process_engineering', 'rd_formulazione',
  'quality_control', 'quality_assurance', 'ehs_sustainability',
  'registrazione_conformita', 'business_development_conto_terzi',
  -- livello 2 — medical device / diagnostics
  'field_service', 'clinical_affairs_device', 'product_management_device',
  'regulatory_mdr_ivdr', 'training_clinico',
  -- livello 2 — cro
  'clinical_operations_cro', 'data_management_biostat',
  'project_management_clinico', 'business_development_proposal',
  -- livello 2 — consumer / nutraceutical / cosmetics
  'trade_marketing_retail', 'ecommerce', 'rd_formulazione_consumer',
  -- livello 2 — digital health
  'product_management_software', 'software_engineering', 'data_science_ai',
  'ux_ui', 'regulatory_samd', 'customer_success',
  -- livello 2 — servizi sanitari / farmacia
  'operations_punto_vendita', 'farmacista', 'customer_service',
  -- livello 2 — consulenza
  'erogazione_consulenza'
));
