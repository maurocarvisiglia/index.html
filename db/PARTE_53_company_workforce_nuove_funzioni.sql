-- =============================================================================
-- COMPANY_WORKFORCE: SETTE FUNZIONI NUOVE — 28/09/2026
-- =============================================================================
-- Revisione della tassonomia (scripts/lib/organico-tassonomia.mjs), misurata su
-- 244.558 persone: dal 32,1% all'88,5% classificate. Servono sette codici che
-- la tassonomia del 27/08 non prevedeva:
--   personale_medico, infermieri_oss, professioni_sanitarie  — ~19.000 persone
--     (nurse, doctor, physiotherapist, psychologist...) finora senza funzione
--   engineering_tecnico, project_management — ruoli tecnici e di progetto
--     trasversali, prima esistenti solo dentro il CDMO
--   stage_formazione — intern, student, trainee, docenti
--   generico_non_classificabile — employee, manager, consultant isolati:
--     DICHIARATI come non classificabili, non forzati in una funzione e
--     contati a parte nei numeri di copertura
-- =============================================================================

alter table public.company_workforce drop constraint if exists company_workforce_funzione_check;
alter table public.company_workforce add constraint company_workforce_funzione_check check (funzione in (
  -- livello 1 — universale
  'general_management', 'hr', 'finance_admin', 'legal_compliance', 'it_digital',
  'procurement', 'logistics_supply_chain', 'marketing_communications',
  'sales_commercial', 'business_development', 'facilities_maintenance',
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
