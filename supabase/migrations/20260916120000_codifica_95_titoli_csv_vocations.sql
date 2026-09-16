-- Codifica dei 95 titoli non mappati trovati nel CSV
-- vocations-positions-1789554024.csv, prima di importarlo -- richiesto da
-- Mauro il 16/09/2026 ("Creiamo i ruoli per i 95 titoli non presenti").
--
-- Metodo: simulata la stessa identica logica di normalizeJobTitle()
-- (alias esatto -> canonical_role esatto -> match a parola intera ordinato
-- per lunghezza) su tutti i 256 titoli distinti del CSV senza scrivere in
-- job_listings (il CSV non viene importato in questa sessione). Dei 95
-- risultati senza canonical_role: 2 esclusi di proposito (vedi nota sotto),
-- gli altri 93 sono qui -- 70 come nuovo alias verso un canonical_role GIA'
-- esistente, 23 sotto 18 canonical_role nuovi (alcuni titoli condividono lo
-- stesso ruolo, es. le due varianti "Assay Transfer Team Technician").
--
-- Esclusi (nessun ruolo creato): "3D Artist/Renderista" (Martina Re, azienda
-- ora in blacklist, ruolo non-Life-Sciences) e "Ingegnere Junior" (Bgrid,
-- azienda ora in blacklist, titolo troppo generico -- nessuna disciplina
-- specificata -- per essere classificato con criterio).
--
-- Scoperta in corsa: "Addetto Accettazione" e "Clinical Trial Administrator"
-- erano gia' canonical_role usati in job_aliases (quindi gia' "vivi" nei dati)
-- ma MAI registrati in job_taxonomy stessa -- gap preesistente, corretto qui
-- perche' questa migration tocca comunque quella tabella per lo stesso motivo.

insert into public.job_taxonomy (canonical_role, role_family, functional_area, seniority_default, field_hq_default)
select 'Addetto Back Office Amministrativo', 'support', 'admin', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Addetto Back Office Amministrativo')
union all
select 'Analista Credito', 'support', 'finance', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Analista Credito')
union all
select 'Application Specialist', 'manufacturing', 'manufacturing', null, 'Field'
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Application Specialist')
union all
select 'Assay Transfer Technician', 'scientific_rd', 'rd', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Assay Transfer Technician')
union all
select 'Sales Enablement Specialist', 'commercial', 'commercial', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Sales Enablement Specialist')
union all
select 'Analytical Operations Manager', 'scientific_rd', 'rd', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Analytical Operations Manager')
union all
select 'Beauty Consultant', 'commercial', 'commercial', null, 'Field'
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Beauty Consultant')
union all
select 'Commercial Development Analyst', 'business_development', 'business_development', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Commercial Development Analyst')
union all
select 'Digital Innovation Manager', 'it', 'it', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Digital Innovation Manager')
union all
select 'F2F Fundraising Coordinator', 'commercial', 'commercial', null, 'Field'
where not exists (select 1 from public.job_taxonomy where canonical_role = 'F2F Fundraising Coordinator')
union all
select 'Field Applications Engineer', 'manufacturing', 'manufacturing', null, 'Field'
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Field Applications Engineer')
union all
select 'Firmware Engineer', 'it', 'it', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Firmware Engineer')
union all
select 'Growth Engineer', 'it', 'it', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Growth Engineer')
union all
select 'Imaging & Asset Manager', 'manufacturing', 'manufacturing', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Imaging & Asset Manager')
union all
select 'Prototypist', 'scientific_rd', 'rd', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Prototypist')
union all
select 'Packaging Specialist', 'scientific_rd', 'rd', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Packaging Specialist')
union all
select 'Segreteria di Direzione', 'support', 'admin', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Segreteria di Direzione')
union all
select 'Psicoterapeuta', 'support', 'healthcare_services', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Psicoterapeuta')
union all
select 'Addetto Accettazione', 'support', 'healthcare_services', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Addetto Accettazione')
union all
select 'Clinical Trial Administrator', 'clinical_operations', 'clinical_operations', null, null
where not exists (select 1 from public.job_taxonomy where canonical_role = 'Clinical Trial Administrator');

insert into public.job_aliases (alias, canonical_role, role_family, functional_area)
select 'Account Manager', 'Key Account Manager', 'commercial', 'commercial'
where not exists (select 1 from public.job_aliases where alias = 'Account Manager')
union all
select 'Addetto/a accoglienza e accettazione', 'Addetto Accettazione', 'support', 'healthcare_services'
where not exists (select 1 from public.job_aliases where alias = 'Addetto/a accoglienza e accettazione')
union all
select 'Addetto/a alla Segreteria Medica ed Accettazione', 'Addetto Accettazione', 'support', 'healthcare_services'
where not exists (select 1 from public.job_aliases where alias = 'Addetto/a alla Segreteria Medica ed Accettazione')
union all
select 'Addetto/a info point', 'Addetto Accettazione', 'support', 'healthcare_services'
where not exists (select 1 from public.job_aliases where alias = 'Addetto/a info point')
union all
select 'Medical desk officer', 'Addetto Accettazione', 'support', 'healthcare_services'
where not exists (select 1 from public.job_aliases where alias = 'Medical desk officer')
union all
select 'controllo qualità e collaudo', 'Quality Control Operator', 'regulatory_quality', 'quality'
where not exists (select 1 from public.job_aliases where alias = 'controllo qualità e collaudo')
union all
select 'Ufficio Gare e Offerte', 'Tender Office Specialist', 'market_access', 'market_access'
where not exists (select 1 from public.job_aliases where alias = 'Ufficio Gare e Offerte')
union all
select 'Analista Turnista di laboratorio', 'Quality Control Analyst', 'regulatory_quality', 'quality'
where not exists (select 1 from public.job_aliases where alias = 'Analista Turnista di laboratorio')
union all
select 'Assistente ufficio acquisti', 'Procurement Specialist', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'Assistente ufficio acquisti')
union all
select 'Associate Technical Consultant', 'Field Service Engineer', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'Associate Technical Consultant')
union all
select 'Automation technical support', 'Automation Engineer', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'Automation technical support')
union all
select 'Electrical & Controls Engineer', 'Automation Engineer', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'Electrical & Controls Engineer')
union all
select 'branch supervisor', 'Store Manager', 'commercial', 'commercial'
where not exists (select 1 from public.job_aliases where alias = 'branch supervisor')
union all
select 'Business Development', 'Business Development Manager', 'business_development', 'business_development'
where not exists (select 1 from public.job_aliases where alias = 'Business Development')
union all
select 'Business Development Representative', 'Business Development Manager', 'business_development', 'business_development'
where not exists (select 1 from public.job_aliases where alias = 'Business Development Representative')
union all
select 'Category Manager', 'Procurement Specialist', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'Category Manager')
union all
select 'Corporate Partnership Manager', 'Strategic Partnerships Manager', 'business_development', 'business_development'
where not exists (select 1 from public.job_aliases where alias = 'Corporate Partnership Manager')
union all
select 'Customer Intelligence', 'Market Research Analyst', 'market_access', 'market_access'
where not exists (select 1 from public.job_aliases where alias = 'Customer Intelligence')
union all
select 'Data Operations Analyst', 'Data Analyst', 'support', 'it'
where not exists (select 1 from public.job_aliases where alias = 'Data Operations Analyst')
union all
select 'Equipment Specialist', 'Technical Support Engineer', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'Equipment Specialist')
union all
select 'Multichannel Specialist', 'Omnichannel Manager', 'marketing', 'marketing'
where not exists (select 1 from public.job_aliases where alias = 'Multichannel Specialist')
union all
select 'Master Data & Product Data Specialist', 'Data Analyst', 'support', 'it'
where not exists (select 1 from public.job_aliases where alias = 'Master Data & Product Data Specialist')
union all
select 'New Product Planning Manager', 'Product Manager', 'marketing', 'marketing'
where not exists (select 1 from public.job_aliases where alias = 'New Product Planning Manager')
union all
select 'Formulator', 'Formulation Scientist', 'scientific_rd', 'rd'
where not exists (select 1 from public.job_aliases where alias = 'Formulator')
union all
select 'Helpdesk', 'IT Specialist', 'it', 'it'
where not exists (select 1 from public.job_aliases where alias = 'Helpdesk')
union all
select 'Payroll/Administration Specialist', 'HR Specialist', 'support', 'hr'
where not exists (select 1 from public.job_aliases where alias = 'Payroll/Administration Specialist')
union all
select 'HSE Consultant', 'EHS/HSE Specialist', 'regulatory_quality', 'quality'
where not exists (select 1 from public.job_aliases where alias = 'HSE Consultant')
union all
select 'Officer, HSE', 'EHS/HSE Specialist', 'regulatory_quality', 'quality'
where not exists (select 1 from public.job_aliases where alias = 'Officer, HSE')
union all
select 'Specialista HSE', 'EHS/HSE Specialist', 'regulatory_quality', 'quality'
where not exists (select 1 from public.job_aliases where alias = 'Specialista HSE')
union all
select 'Commercial Finance Specialist', 'Finance Business Partner', 'support', 'finance'
where not exists (select 1 from public.job_aliases where alias = 'Commercial Finance Specialist')
union all
select 'Import Export Specialist', 'Trade Compliance Specialist', 'manufacturing', 'supply_chain'
where not exists (select 1 from public.job_aliases where alias = 'Import Export Specialist')
union all
select 'Infermiera/e', 'Infermiere', 'support', 'healthcare_services'
where not exists (select 1 from public.job_aliases where alias = 'Infermiera/e')
union all
select 'Ingegnere dell''Automazione', 'Automation Engineer', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'Ingegnere dell''Automazione')
union all
select 'ITOT Robotics', 'Automation Engineer', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'ITOT Robotics')
union all
select 'Programmatore Softwarista PLC', 'Automation Engineer', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'Programmatore Softwarista PLC')
union all
select 'Integrated Media Director', 'Marketing Director', 'marketing', 'marketing'
where not exists (select 1 from public.job_aliases where alias = 'Integrated Media Director')
union all
select 'Brand Operations Engineer', 'Product Manager', 'marketing', 'marketing'
where not exists (select 1 from public.job_aliases where alias = 'Brand Operations Engineer')
union all
select 'Communication Specialist', 'Marketing Specialist', 'marketing', 'marketing'
where not exists (select 1 from public.job_aliases where alias = 'Communication Specialist')
union all
select 'IT Junior Analyst', 'IT Specialist', 'it', 'it'
where not exists (select 1 from public.job_aliases where alias = 'IT Junior Analyst')
union all
select 'Sales Channel Operations Specialist', 'Sales Specialist', 'commercial', 'commercial'
where not exists (select 1 from public.job_aliases where alias = 'Sales Channel Operations Specialist')
union all
select 'Trial Delivery Manager', 'Clinical Trial Manager', 'clinical_operations', 'clinical_operations'
where not exists (select 1 from public.job_aliases where alias = 'Trial Delivery Manager')
union all
select 'Maintenance & Facilities Engineer', 'Maintenance Manager', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'Maintenance & Facilities Engineer')
union all
select 'Reliability Maintenance Engineer', 'Maintenance Manager', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'Reliability Maintenance Engineer')
union all
select 'Market Access Director', 'Market Access Manager', 'market_access', 'market_access'
where not exists (select 1 from public.job_aliases where alias = 'Market Access Director')
union all
select 'Meccanico Attrezzista', 'Manutentore', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'Meccanico Attrezzista')
union all
select 'Building Technician', 'Manutentore', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'Building Technician')
union all
select 'Model-Based Controls Engineer', 'Automation Engineer', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'Model-Based Controls Engineer')
union all
select 'Program Manager', 'Project Manager', 'general_management', 'general_management'
where not exists (select 1 from public.job_aliases where alias = 'Program Manager')
union all
select 'vendita strumentazione medicale', 'Informatore Scientifico del Dispositivo Medico', 'commercial', 'commercial'
where not exists (select 1 from public.job_aliases where alias = 'vendita strumentazione medicale')
union all
select 'QA& RA Specialist FDA', 'Regulatory Affairs Specialist', 'regulatory_quality', 'regulatory_affairs'
where not exists (select 1 from public.job_aliases where alias = 'QA& RA Specialist FDA')
union all
select 'QA&RA FDA', 'Regulatory Affairs Specialist', 'regulatory_quality', 'regulatory_affairs'
where not exists (select 1 from public.job_aliases where alias = 'QA&RA FDA')
union all
select 'Quality & Compliance System', 'Quality Assurance Specialist', 'regulatory_quality', 'quality'
where not exists (select 1 from public.job_aliases where alias = 'Quality & Compliance System')
union all
select 'Quality Control Expert', 'Quality Control Analyst', 'regulatory_quality', 'quality'
where not exists (select 1 from public.job_aliases where alias = 'Quality Control Expert')
union all
select 'Laboratory & Prototyping Specialist', 'Laboratory Researcher', 'scientific_rd', 'rd'
where not exists (select 1 from public.job_aliases where alias = 'Laboratory & Prototyping Specialist')
union all
select 'R&D Officer', 'Research Scientist', 'scientific_rd', 'rd'
where not exists (select 1 from public.job_aliases where alias = 'R&D Officer')
union all
select 'Regional HealthCare Partner', 'Key Account Manager', 'commercial', 'commercial'
where not exists (select 1 from public.job_aliases where alias = 'Regional HealthCare Partner')
union all
select 'Regulatory Affairs Expert', 'Regulatory Affairs Specialist', 'regulatory_quality', 'regulatory_affairs'
where not exists (select 1 from public.job_aliases where alias = 'Regulatory Affairs Expert')
union all
select 'Research Contracts Associate', 'Clinical Trial Contracts Specialist', 'clinical_operations', 'clinical_operations'
where not exists (select 1 from public.job_aliases where alias = 'Research Contracts Associate')
union all
select 'Research Technician', 'Laboratory Researcher', 'scientific_rd', 'rd'
where not exists (select 1 from public.job_aliases where alias = 'Research Technician')
union all
select 'Central Support Engineer', 'Technical Support Engineer', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'Central Support Engineer')
union all
select 'Digital & Tech Business Partner', 'Digital Solutions Specialist', 'it', 'it'
where not exists (select 1 from public.job_aliases where alias = 'Digital & Tech Business Partner')
union all
select 'ricerca e sviluppo - Nutraceutico', 'Research Scientist', 'scientific_rd', 'rd'
where not exists (select 1 from public.job_aliases where alias = 'ricerca e sviluppo - Nutraceutico')
union all
select 'Account Executive', 'Sales Representative', 'commercial', 'commercial'
where not exists (select 1 from public.job_aliases where alias = 'Account Executive')
union all
select 'System Specialist', 'Technical Support Engineer', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'System Specialist')
union all
select 'Training/Education Spec', 'Learning & Development Specialist', 'support', 'hr'
where not exists (select 1 from public.job_aliases where alias = 'Training/Education Spec')
union all
select 'Commercial Operations Lead', 'Operations Director', 'general_management', 'general_management'
where not exists (select 1 from public.job_aliases where alias = 'Commercial Operations Lead')
union all
select 'Senior Administrative Assistant Medical', 'Addetto Back Office Amministrativo', 'support', 'admin'
where not exists (select 1 from public.job_aliases where alias = 'Senior Administrative Assistant Medical')
union all
select 'Analista del credito', 'Analista Credito', 'support', 'finance'
where not exists (select 1 from public.job_aliases where alias = 'Analista del credito')
union all
select 'Assay Transfer Team Technician', 'Assay Transfer Technician', 'scientific_rd', 'rd'
where not exists (select 1 from public.job_aliases where alias = 'Assay Transfer Team Technician')
union all
select 'Assoc Sales Enablement Spec', 'Sales Enablement Specialist', 'commercial', 'commercial'
where not exists (select 1 from public.job_aliases where alias = 'Assoc Sales Enablement Spec')
union all
select 'Sales Enablement', 'Sales Enablement Specialist', 'commercial', 'commercial'
where not exists (select 1 from public.job_aliases where alias = 'Sales Enablement')
union all
select 'Associate Director Analytical Operations', 'Analytical Operations Manager', 'scientific_rd', 'rd'
where not exists (select 1 from public.job_aliases where alias = 'Associate Director Analytical Operations')
union all
select 'Analytical Operations', 'Analytical Operations Manager', 'scientific_rd', 'rd'
where not exists (select 1 from public.job_aliases where alias = 'Analytical Operations')
union all
select 'F2F Location Coordinator', 'F2F Fundraising Coordinator', 'commercial', 'commercial'
where not exists (select 1 from public.job_aliases where alias = 'F2F Location Coordinator')
union all
select 'F2F Officer', 'F2F Fundraising Coordinator', 'commercial', 'commercial'
where not exists (select 1 from public.job_aliases where alias = 'F2F Officer')
union all
select 'GTM Engineer', 'Growth Engineer', 'it', 'it'
where not exists (select 1 from public.job_aliases where alias = 'GTM Engineer')
union all
select 'Prototyper', 'Prototypist', 'scientific_rd', 'rd'
where not exists (select 1 from public.job_aliases where alias = 'Prototyper')
union all
-- "Addetto/a back office amministrativo" non veniva intercettato dal canonical_role
-- nudo ("Addetto Back Office Amministrativo") per lo scarto "Addetto"/"Addetto/a".
select 'back office amministrativo', 'Addetto Back Office Amministrativo', 'support', 'admin'
where not exists (select 1 from public.job_aliases where alias = 'back office amministrativo')
union all
-- "Ingegnere dell'Automazione" nel CSV usa l'apostrofo tipografico "'" (U+2019),
-- diverso dall'apostrofo dritto "'" usato sopra -- stesso identico guasto di
-- codifica documentato in CLAUDE.md: il primo sospetto e' la codifica, non la
-- logica. Alias su una parola sola, senza apostrofo, per non ripetere l'errore.
select 'Automazione', 'Automation Engineer', 'manufacturing', 'manufacturing'
where not exists (select 1 from public.job_aliases where alias = 'Automazione');

do $$
declare
  n_ruoli integer;
  n_alias integer;
begin
  select count(*) into n_ruoli from public.job_taxonomy where canonical_role in ('Addetto Back Office Amministrativo','Analista Credito','Application Specialist','Assay Transfer Technician','Sales Enablement Specialist','Analytical Operations Manager','Beauty Consultant','Commercial Development Analyst','Digital Innovation Manager','F2F Fundraising Coordinator','Field Applications Engineer','Firmware Engineer','Growth Engineer','Imaging & Asset Manager','Prototypist','Packaging Specialist','Segreteria di Direzione','Psicoterapeuta','Addetto Accettazione','Clinical Trial Administrator');
  select count(*) into n_alias from public.job_aliases where alias in ('Account Manager','Addetto/a accoglienza e accettazione','Addetto/a alla Segreteria Medica ed Accettazione','Addetto/a info point','Medical desk officer','controllo qualità e collaudo','Ufficio Gare e Offerte','Analista Turnista di laboratorio','Assistente ufficio acquisti','Associate Technical Consultant','Automation technical support','Electrical & Controls Engineer','branch supervisor','Business Development','Business Development Representative','Category Manager','Corporate Partnership Manager','Customer Intelligence','Data Operations Analyst','Equipment Specialist','Multichannel Specialist','Master Data & Product Data Specialist','New Product Planning Manager','Formulator','Helpdesk','Payroll/Administration Specialist','HSE Consultant','Officer, HSE','Specialista HSE','Commercial Finance Specialist','Import Export Specialist','Infermiera/e','Ingegnere dell''Automazione','ITOT Robotics','Programmatore Softwarista PLC','Integrated Media Director','Brand Operations Engineer','Communication Specialist','IT Junior Analyst','Sales Channel Operations Specialist','Trial Delivery Manager','Maintenance & Facilities Engineer','Reliability Maintenance Engineer','Market Access Director','Meccanico Attrezzista','Building Technician','Model-Based Controls Engineer','Program Manager','vendita strumentazione medicale','QA& RA Specialist FDA','QA&RA FDA','Quality & Compliance System','Quality Control Expert','Laboratory & Prototyping Specialist','R&D Officer','Regional HealthCare Partner','Regulatory Affairs Expert','Research Contracts Associate','Research Technician','Central Support Engineer','Digital & Tech Business Partner','ricerca e sviluppo - Nutraceutico','Account Executive','System Specialist','Training/Education Spec','Commercial Operations Lead','Senior Administrative Assistant Medical','Analista del credito','Assay Transfer Team Technician','Assoc Sales Enablement Spec','Sales Enablement','Associate Director Analytical Operations','Analytical Operations','F2F Location Coordinator','F2F Officer','GTM Engineer','Prototyper');
  raise notice '% canonical_role e % alias verificati presenti dopo la migration.', n_ruoli, n_alias;
end $$;

