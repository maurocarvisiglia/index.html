// Alias creati leggendo Competenze/Target reali di ogni titolo non mappato del
// CSV vocations-positions-1788357603.csv (522 righe), per farlo importare gia'
// classificato correttamente il 01/09/2026. Nessuna IA: ogni riga e' stata letta
// e confrontata a mano con la tassonomia esistente.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DRY_RUN = process.argv.includes('--dry-run');

// [alias, canonical_role, functional_area, role_family]
const ALIASES = [
  // pattern aziendali ricorrenti (sottostringa - piu' variabili di titolo per la stessa azienda/ruolo)
  ['Coordinatore Retail', 'Area Manager Commercial', 'commercial', 'commercial'],
  ['Start-up specialist', 'Clinical Research Associate (CRA)', 'clinical_operations', 'clinical_operations'],
  ['Business Insight and SFE Specialist', 'Market Research Analyst', 'market_access', 'market_access'],
  ['R&D Product Development Engineer', 'Formulation Scientist', 'rd', 'scientific_rd'],
  ['Sales Controlling Business Partner', 'Finance Business Partner', 'finance', 'support'],
  ['European Cruise Logistics Manager', 'Supply Chain Manager', 'supply_chain', 'manufacturing'],

  // titoli esatti (un solo pattern osservato in questo lotto)
  ['Sales Partner, Visualization & COMMs (Triveneto e Sardegna)', 'Clinical Sales Specialist', 'commercial', 'commercial'],
  ['Office Coordinator & Administrative Assistant', 'Project Manager', 'general_management', 'general_management'],
  ['Front office', 'Addetto Accettazione', 'healthcare_services', 'support'],
  ['Quality Control Expert', 'Quality Control Analyst', 'quality', 'regulatory_quality'],
  ['FORMULATORE COSMETICO', 'Formulation Scientist', 'rd', 'scientific_rd'],
  ['Clinical Science Associate Cardiovascolare - Campania', 'Informatore Scientifico del Farmaco', 'commercial', 'commercial'],
  ['Computational RNA Biologist', 'Research Scientist', 'rd', 'scientific_rd'],
  ['Addetto Controllo di Gestione e supporto contabilità', 'Controller', 'finance', 'support'],
  ['Packaging Operator', 'Operatore di Produzione', 'manufacturing', 'manufacturing'],
  ['Sales Account', 'Sales Representative', 'commercial', 'commercial'],
  ['Impiegato ufficio gare e appalti', 'Tender Office Specialist', 'market_access', 'market_access'],
  ['Production & Material Planner', 'Production Planner', 'manufacturing', 'manufacturing'],
  ['Maintenance Planner Engineer', 'Maintenance Manager', 'manufacturing', 'manufacturing'],
  ['Addetto/a front office centro polidiagnostico', 'Addetto Accettazione', 'healthcare_services', 'support'],
  ['Addetto/a Ufficio Gare Junior', 'Tender Office Specialist', 'market_access', 'market_access'],
  ['Regulatory Affairs Assistant', 'Regulatory Affairs Specialist', 'regulatory_affairs', 'regulatory_quality'],
  ['Corporate Reporting Manager', 'Financial Controller', 'finance', 'support'],
  ['Operaio addetto assemblaggio', 'Operatore di Produzione', 'manufacturing', 'manufacturing'],
  ['QC Microbiology Analyst', 'Quality Control Analyst', 'quality', 'regulatory_quality'],
  ['Junior Patient Journey Partner HCC', 'Informatore Scientifico del Farmaco', 'commercial', 'commercial'],
  ['Manager, Business Development', 'Business Development Manager', 'business_development', 'business_development'],
  ['Prototype Technician', 'Laboratory Researcher', 'rd', 'scientific_rd'],
  ['IT – Application Specialist', 'IT Specialist', 'it', 'it'],
  ['Responsabile Reparto Produzione Mescolazione', 'Production Manager', 'manufacturing', 'manufacturing'],
  ['Responsabile Marketing e Comunicazione', 'Marketing Manager', 'marketing', 'marketing'],
  ['Senior Warehouse Operator', 'Operatore Logistica', 'supply_chain', 'manufacturing'],
  ['Sr Mgr, Supply Chain Development Leader', 'Supply Chain Manager', 'supply_chain', 'manufacturing'],
  ['Clinical Trial Supply Manager', 'Clinical Trial Manager', 'clinical_operations', 'clinical_operations'],
  ['Addetto alle spedizioni', 'Operatore Logistica', 'supply_chain', 'manufacturing'],
  ['Senior Director R&D Portfolio and Program Management', 'R&D Manager', 'rd', 'scientific_rd'],
  ['QC Data reviewer', 'Quality Control Analyst', 'quality', 'regulatory_quality'],
  ['Material Shipper', 'Operatore Logistica', 'supply_chain', 'manufacturing'],
  ['Global Data Factory Specialist', 'BI Analyst', 'it', 'it'],
  ['Director, Early Development CMC Leader', 'CMC Technical Leader', 'rd', 'rd'],
  ['Operatore Controllo Qualità Meccanico', 'Quality Control Analyst', 'quality', 'regulatory_quality'],
  ['Jr Global Key Account – Energy & Mobility Division', 'Key Account Manager', 'commercial', 'commercial'],
  ['Senior Specialist, Finance Solution Expert - Controlling', 'Controller', 'finance', 'support'],
  ['Account Manager Food Industry - Emilia Romagna & North-East Italy', 'Area Manager Commercial', 'commercial', 'commercial'],
  ['Junior Accounting Specialist', 'Accountant', 'finance', 'support'],
  ['Purchasing Supervisor', 'Procurement Specialist', 'supply_chain', 'manufacturing'],
  ['Presales Solutions Architect', 'IT Specialist', 'it', 'it'],
  ['QA Specialist', 'Quality Assurance Specialist', 'quality', 'regulatory_quality'],
  ['Tech Consultant', 'Product Specialist', 'commercial', 'commercial'],
  ['Specialista contabilità categoria protetta art. 18 legge 68/99', 'Accountant', 'finance', 'support'],
  ['Impiegato/a gestione crediti', 'Accountant', 'finance', 'support'],
  ['Tech & Data technician', 'IT Specialist', 'it', 'it'],
  ['Impiegata/o Amministrativo', 'Accountant', 'finance', 'support'],
  ['Agente di commercio monomandatario', 'Sales Representative', 'commercial', 'commercial'],
  ['Accounting Manager', 'Controller', 'finance', 'support'],
  ['Addetto/a alle vendite', 'Sales Specialist', 'commercial', 'commercial'],
  ['Segreteria Medicina del Lavoro', 'Addetto Accettazione', 'healthcare_services', 'support'],
  ['Instandhalter Produktionsanlagen (all genders)', 'Manutentore', 'manufacturing', 'manufacturing'],
  ['CNC Milling Machine Operator / CAM User (all genders)', 'Process Engineer', 'manufacturing', 'manufacturing'],
  ['Zahntechniker Qualitätskontrolle (all genders)', 'Quality Control Analyst', 'quality', 'regulatory_quality'],
  ['Dental Technician Quality Control (all genders)', 'Quality Control Analyst', 'quality', 'regulatory_quality'],
  ['Maschinenbaumechaniker für die CAM-Entwicklung (all genders)', 'Process Engineer', 'manufacturing', 'manufacturing'],
  ['Konstrukteur Maschinenbau (all genders)', 'Process Engineer', 'manufacturing', 'manufacturing'],
  ['Operatore/Operatrice Controllo Qualità Microbiologico – Categoria Protetta Art. 18 Legge 68/99', 'Quality Control Analyst', 'quality', 'regulatory_quality'],
  ['Operatore/Operatrice Confezionamento – Categoria Protetta Art. 18 Legge 68/99', 'Operatore di Produzione', 'manufacturing', 'manufacturing'],
  ['Associate Manager, Clinical Operations Site Management - Italy/Spain/Serbia- Remote', 'Clinical Operations Manager', 'clinical_operations', 'clinical_operations'],
  ['Responsabile controllo qualità', 'Quality Control Manager', 'quality', 'regulatory_quality'],
  ['AI Engineering Graduate', 'AI Engineer', 'it', 'it'],
  ['Programmer', 'Biostatistician', 'clinical_operations', 'clinical_operations'],
  ['Make-Up Pre-Industrialization Specialist', 'Process Engineer', 'manufacturing', 'manufacturing'],
  ['Process Improvement and Project Management Specialist', 'Project Manager', 'general_management', 'general_management'],
  ['Director - Data Science & AI', 'Data Scientist', 'it', 'it'],
  ['Delivery Manager - Partner Integration & Implementation', 'Project Manager', 'general_management', 'general_management'],
  ['Optometrista', 'Ottico/Optometrista', 'commercial', 'commercial'],
  ['Impiegato/a supply chain', 'Supply Chain Analyst', 'supply_chain', 'manufacturing'],
  ['Elettricista', 'Manutentore', 'manufacturing', 'manufacturing'],
  ['Addetto Assistenza Software', 'IT Specialist', 'it', 'it'],
  ['Analytical Expert - Science & Technology', 'Analytical Scientist', 'rd', 'scientific_rd'],
  ['Senior System Verification Engineer', 'Manufacturing Engineer', 'manufacturing', 'manufacturing'],
  ['South Europe Regulatory Lead', 'Regulatory Affairs Manager', 'regulatory_affairs', 'regulatory_quality'],
  ['Quality Business owner MES and ERP', 'Quality Assurance Specialist', 'quality', 'regulatory_quality'],
  ['Cyber Security Specialist', 'IT Specialist', 'it', 'it'],
  ['Ingegnere Robotico', 'Process Engineer', 'manufacturing', 'manufacturing'],
  ['Senior Manager, Strategic Initiatives', 'Project Manager', 'general_management', 'general_management'],
  ['Equipment Operator', 'Operatore di Produzione', 'manufacturing', 'manufacturing'],
  ['Manager, Technical Marketing CDMO', 'Marketing Manager', 'marketing', 'marketing'],
  ['Quality System & Compliance Expert', 'Quality Assurance Specialist', 'quality', 'regulatory_quality'],
  ['R&D Technician Vanish', 'Formulation Scientist', 'rd', 'scientific_rd'],
  ['Manufacturing Sterile Documentation Operator', 'Operatore di Produzione', 'manufacturing', 'manufacturing'],
  ['Ingegnere clinico di commessa categoria protetta L 68/99', 'Field Service Engineer', 'manufacturing', 'manufacturing'],
  ['Application Specialist - South - Physicist', 'Product Specialist', 'commercial', 'commercial'],
  ['Dental Account Specialist - Genova', 'Key Account Manager', 'commercial', 'commercial'],
  ['SUSTAINABILITY MANAGER - FOOD & BEVERAGE SECTOR (incl. prot. categories 68/99)', 'Business Development Manager', 'business_development', 'business_development'],
  ['Patient Safety Science Lead', 'Pharmacovigilance Specialist', 'drug_safety', 'regulatory_quality']
];

async function main(){
  console.log(DRY_RUN ? '🔎 DRY RUN\n' : '⚠️  MODALITA\' REALE\n');
  const { data: taxonomy } = await supabase.from('job_taxonomy').select('canonical_role');
  const validRoles = new Set(taxonomy.map(t=>t.canonical_role));
  validRoles.add('Addetto Accettazione'); // esiste solo come convenzione alias, mai in job_taxonomy
  validRoles.add('Clinical Trial Administrator'); // idem
  const { data: existing } = await supabase.from('job_aliases').select('alias');
  const existingLower = new Set(existing.map(a=>a.alias.toLowerCase()));

  let toAdd=0, skippedExisting=0, badRole=0;
  for(const [alias, role, area, family] of ALIASES){
    if(!validRoles.has(role)){ console.error(`❌ canonical_role inesistente: "${role}" (alias "${alias}")`); badRole++; continue; }
    if(existingLower.has(alias.toLowerCase())){ console.log(`(gia' esiste) "${alias}"`); skippedExisting++; continue; }
    console.log(`+ "${alias}" -> ${role} (${area})`);
    toAdd++;
    if(!DRY_RUN){
      const {error} = await supabase.from('job_aliases').insert({alias, canonical_role:role, functional_area:area, role_family:family});
      if(error) console.error('  errore:', error.message);
    }
  }
  console.log(`\nDa aggiungere: ${toAdd} | Gia' presenti: ${skippedExisting} | canonical_role non validi: ${badRole}`);
  console.log(`Totale alias definiti nello script: ${ALIASES.length}`);
}
main();
