-- =============================================================================
-- COMPANY_WORKFORCE: GRANULARITA' COMMERCIALE + NUOVE REGOLE — 01/10/2026
-- =============================================================================
-- Richiesto da Mauro dopo l'introduzione del benchmark organico nei report:
-- 'sales_commercial' restava il bucket piu' grande (10.274 persone) mischiando
-- ruoli molto diversi per profilo di recruiting — Key Account Manager, Area/
-- Territory/Regional Manager, Sales/Commercial Director, Export Manager sono
-- tutti "commerciali" ma rispondono a ricerche di tutt'altro tipo.
--
-- Quattro nuovi codici, livello universale (si applicano a qualunque settore,
-- come 'isf_informatore_scientifico'):
--   key_account_manager  — Key/National/Strategic Account Manager
--   area_manager          — Area/Territory/District/Regional Manager
--   sales_leadership       — Sales/Commercial Director
--   export_manager         — Export Manager/Area/Director
-- =============================================================================

alter table public.company_workforce drop constraint if exists company_workforce_funzione_check;
alter table public.company_workforce add constraint company_workforce_funzione_check check (funzione in (
  'general_management', 'hr', 'finance_admin', 'legal_compliance', 'it_digital',
  'procurement', 'logistics_supply_chain', 'marketing_communications',
  'sales_commercial', 'isf_informatore_scientifico', 'key_account_manager', 'area_manager',
  'sales_leadership', 'export_manager', 'business_development', 'facilities_maintenance',
  'personale_medico', 'infermieri_oss', 'professioni_sanitarie',
  'engineering_tecnico', 'project_management', 'stage_formazione', 'generico_non_classificabile',
  'medical_affairs_msl', 'market_access', 'regulatory_affairs_prodotto',
  'pharmacovigilance', 'clinical_operations_locali', 'patient_support',
  'produzione_site_operations', 'process_engineering', 'rd_formulazione',
  'quality_control', 'quality_assurance', 'ehs_sustainability',
  'registrazione_conformita', 'business_development_conto_terzi',
  'field_service', 'clinical_affairs_device', 'product_management_device',
  'regulatory_mdr_ivdr', 'training_clinico',
  'clinical_operations_cro', 'data_management_biostat',
  'project_management_clinico', 'business_development_proposal',
  'trade_marketing_retail', 'ecommerce', 'rd_formulazione_consumer',
  'product_management_software', 'software_engineering', 'data_science_ai',
  'ux_ui', 'regulatory_samd', 'customer_success',
  'operations_punto_vendita', 'farmacista', 'customer_service',
  'erogazione_consulenza'
));
