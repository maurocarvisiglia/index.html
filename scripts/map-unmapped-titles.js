import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Mappatura dei 228 titoli non mappati, confermata dall'utente.
// canonical_role riusa nomi esistenti in job_taxonomy dove pertinente,
// altrimenti usa un nome coerente con la convenzione (Title Case).
const M = {
  'progettista meccanico': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'sales partner | spine (centro italia)': ['Key Account Manager', 'commercial', 'commercial'],
  'biopharma regulatory consultant': ['Regulatory Affairs Specialist', 'regulatory_quality', 'regulatory_affairs'],
  'addetta/o accoglienza e accettazione clienti': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'director, global marketing hypertension': ['Marketing Manager', 'marketing', 'marketing'],
  'site supervisor': ['Production Manager', 'manufacturing', 'manufacturing'],
  'water treatment designer': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'junior sap application analyst': ['IT Specialist', 'it', 'it'],
  'specialista di accoglienza': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'global workplace & real estate manager': ['General Manager', 'general_management', 'general_management'],
  'addetta/o accettazione': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'environmental specialist': ['EHS/HSE Specialist', 'regulatory_quality', 'quality'],
  'specialista di accoglienza part time 30 ore settimanali - legnano (mi)': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'principal statistician': ['Biostatistician', 'clinical_operations', 'clinical_operations'],
  'artificial intelligence (ai) specialist': ['AI/ML Engineer', 'it', 'it'],
  "addetto/a assistenza clienti laboratori": ['Addetto Accettazione', 'support', 'healthcare_services'],
  'amps digital specialist': ['Digital Marketing Manager', 'marketing', 'marketing'],
  'global supplier quality head': ['Quality Assurance Manager', 'regulatory_quality', 'quality'],
  'medical lead oncology': ['Medical Manager', 'medical_affairs', 'medical_affairs'],
  'sterility assurance manager': ['Quality Assurance Manager', 'regulatory_quality', 'quality'],
  'healthcare it solutions operations area manager - toscana': ['IT Specialist', 'it', 'it'],
  'manager, pmo': ['General Manager', 'general_management', 'general_management'],
  'site budget and contract specialist - fsp model - italy': ['Clinical Trial Administrator', 'clinical_operations', 'clinical_operations'],
  'training & site compliance h&s specialist': ['EHS/HSE Specialist', 'regulatory_quality', 'quality'],
  'clinic manager': ['General Manager', 'general_management', 'general_management'],
  'hair care global e-commerce expert': ['Digital Marketing Manager', 'marketing', 'marketing'],
  'production quality investigator': ['Quality Control Analyst', 'regulatory_quality', 'quality'],
  'process analyst': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'continuous improvement specialist': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'maintenance operator': ['Manutentore', 'manufacturing', 'manufacturing'],
  'transcend senior manager pmo': ['General Manager', 'general_management', 'general_management'],
  'tecnico assicurazione qualità': ['Quality Assurance Specialist', 'regulatory_quality', 'quality'],
  'it vendor performance & pmo analyst': ['IT Specialist', 'it', 'it'],
  'event specialist': ['Marketing Specialist', 'marketing', 'marketing'],
  'production planning manager': ['Supply Chain Manager', 'manufacturing', 'supply_chain'],
  'sterile supervisor': ['Production Manager', 'manufacturing', 'manufacturing'],
  'head of digital operations & analytics': ['IT Specialist', 'it', 'it'],
  'addetto/a qualifiche e convalide': ['Validation Specialist', 'regulatory_quality', 'quality'],
  'director, global marketing immuno': ['Marketing Manager', 'marketing', 'marketing'],
  'head of quality system data and compliance': ['Quality Assurance Manager', 'regulatory_quality', 'quality'],
  'medical science specialist': ['Medical Advisor', 'medical_affairs', 'medical_affairs'],
  'budget &contract lead - fsp model - italy': ['Clinical Trial Administrator', 'clinical_operations', 'clinical_operations'],
  'reach/clp product compliance senior specialist': ['Regulatory Affairs Specialist', 'regulatory_quality', 'regulatory_affairs'],
  'associate manager tenders & contracts - capital divisions': ['Tender Office Specialist', 'market_access', 'market_access'],
  'qc technology & innovation specialist': ['Quality Control Analyst', 'regulatory_quality', 'quality'],
  'senior local trial manager': ['Clinical Trial Administrator', 'clinical_operations', 'clinical_operations'],
  'senior data sciencist - ai & scientific applications': ['Research Scientist', 'scientific_rd', 'rd'],
  'operatore socio-sanitario': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'technical support europe - immunoassay': ['Industry Technical Consultant', 'commercial', 'commercial'],
  'controlling specialist': ['Accountant', 'support', 'finance'],
  'compensation & benefits and hr administration manager': ['HR Business Partner', 'support', 'hr'],
  'sr technical program manager': ['IT Specialist', 'it', 'it'],
  'laboratory manager coatings & construction': ['Research Scientist', 'scientific_rd', 'rd'],
  'audio master merano': ['Sales Specialist', 'commercial', 'commercial'],
  'mes assistant': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'docente attrezzature lavoro e impiegato tecnico': ['EHS/HSE Specialist', 'regulatory_quality', 'quality'],
  'service manager': ['Field Sales Manager', 'commercial', 'commercial'],
  'sterility assurance manager, parma site': ['Quality Assurance Manager', 'regulatory_quality', 'quality'],
  'assistant cra': ['Clinical Research Associate (CRA)', 'clinical_operations', 'clinical_operations'],
  'tecnico calibrazione strumentale': ['Quality Control Analyst', 'regulatory_quality', 'quality'],
  'junior sap analyst': ['IT Specialist', 'it', 'it'],
  'sr eng process engineering': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'field services engineer ct- pet': ['Field Service Engineer', 'commercial', 'commercial'],
  'senior manager emea, ion chromatography & environmental food safety technical sales specialists': ['Industry Technical Consultant', 'commercial', 'commercial'],
  'account executive laboratory solutions (m/f/d) liguria, italy': ['Key Account Manager', 'commercial', 'commercial'],
  'it service desk specialist': ['IT Specialist', 'it', 'it'],
  'regional access manager (ram) central italy': ['Market Access Manager', 'market_access', 'market_access'],
  'go-to-market junior manager - italia': ['Marketing Manager', 'marketing', 'marketing'],
  'product sales expert – specialty lab solutions (proteins – allergy) (m/f/d)': ['Product Specialist', 'commercial', 'commercial'],
  'tecnico di radiologia medica': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'service specialist autoimmunity eemea': ['Industry Technical Consultant', 'commercial', 'commercial'],
  'itero specialized territory manager milan – north of italy': ['Area Manager Commercial', 'commercial', 'commercial'],
  'country crm manager': ['Marketing Manager', 'marketing', 'commercial'],
  'automation tester': ['Software Engineer', 'it', 'it'],
  'operatore/operatrice di produzione': ['Manutentore', 'manufacturing', 'manufacturing'],
  'global sd&i cloud connectivity development lead': ['Software Engineer', 'it', 'it'],
  'audio master tivoli': ['Sales Specialist', 'commercial', 'commercial'],
  'industrial engineer': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'perfusionista': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'salesforce administrator': ['IT Specialist', 'it', 'it'],
  'consulente hse vicenza': ['EHS/HSE Specialist', 'regulatory_quality', 'quality'],
  'coordinatore/trice infermieristico punti prelievo': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'data platform & analytics engineer': ['Data Analyst', 'it', 'it'],
  'head of opexc': ['Production Manager', 'manufacturing', 'manufacturing'],
  "quality assurance responsible per l'unità distributiva di pavia (part time 30h)": ['Quality Assurance Specialist', 'regulatory_quality', 'quality'],
  'field services engineer ct- pet - puglia&basilicata': ['Field Service Engineer', 'commercial', 'commercial'],
  'e-commerce technical specialist (prestashop)': ['Digital Marketing Manager', 'marketing', 'marketing'],
  'product sales expert – central laboratory solutions, italy (m/f/d)': ['Product Specialist', 'commercial', 'commercial'],
  'audio master gorizia': ['Sales Specialist', 'commercial', 'commercial'],
  'mrb technician': ['Quality Control Analyst', 'regulatory_quality', 'quality'],
  'operatore/operatrice di produzione (m/f/x)': ['Manutentore', 'manufacturing', 'manufacturing'],
  'product sales expert – specialty lab solutions (pharmatoxicology) (m/f/d)': ['Product Specialist', 'commercial', 'commercial'],
  'specialist, qa clinical gcp auditor': ['Quality Assurance Specialist', 'regulatory_quality', 'quality'],
  'contract specialist': ['Clinical Trial Administrator', 'clinical_operations', 'clinical_operations'],
  'audio master rovereto': ['Sales Specialist', 'commercial', 'commercial'],
  'business development, partner success, milan': ['Business Development Manager', 'business_development', 'business_development'],
  'global supply chain planning specialist': ['Supply Chain Manager', 'manufacturing', 'supply_chain'],
  'transcend: director, business readiness and change': ['General Manager', 'general_management', 'general_management'],
  'audio master vittorio veneto': ['Sales Specialist', 'commercial', 'commercial'],
  'impiegato/a risorse umane': ['HR Business Partner', 'support', 'hr'],
  'esperto contabilità e bilancio': ['Accountant', 'support', 'finance'],
  'general accounting specialist': ['Accountant', 'support', 'finance'],
  'director government affairs & policy': ['Government Affairs Manager', 'market_access', 'market_access'],
  'operatore/trice turnista di ecologia': ['Manutentore', 'manufacturing', 'manufacturing'],
  'manufacturing test engineer specialist': ['Quality Control Analyst', 'regulatory_quality', 'manufacturing'],
  'manager, quality system': ['Quality Assurance Manager', 'regulatory_quality', 'quality'],
  "addetta/o accettazione - categoria protetta l.68/99 - part time - bologna": ['Addetto Accettazione', 'support', 'healthcare_services'],
  'addetta/o accettazione - part time 30h': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'qa associate (new product introduction)': ['Quality Assurance Specialist', 'regulatory_quality', 'quality'],
  'addetta/o accettazione - part time 30h - bagno a ripoli (fi)': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'regional access manager (ram)': ['Market Access Manager', 'market_access', 'market_access'],
  'e-commerce conversion & digital shelf specialist': ['Digital Marketing Manager', 'marketing', 'marketing'],
  'specialista di accoglienza - tempo determinato full-time': ['Addetto Accettazione', 'support', 'healthcare_services'],
  "addetta/o accettazione - sostituzione maternità - bologna nord/castel maggiore": ['Addetto Accettazione', 'support', 'healthcare_services'],
  'addetto/a segreteria didattica': ['HR Business Partner', 'support', 'hr'],
  'capo reparto produzione manifattura': ['Production Manager', 'manufacturing', 'manufacturing'],
  'quality engineer': ['Quality Control Analyst', 'regulatory_quality', 'quality'],
  'production planning specialist': ['Supply Chain Manager', 'manufacturing', 'supply_chain'],
  'area manager farmaceutico': ['Area Manager Commercial', 'commercial', 'commercial'],
  'junior hair care formulator': ['Research Scientist', 'scientific_rd', 'rd'],
  'disegnatore/disegnatrice cad': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'regulatory affair dept': ['Regulatory Affairs Specialist', 'regulatory_quality', 'regulatory_affairs'],
  'specialista di accoglienza - tempo determinato full-time - medical center synlab belluno': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'operational excellence manager': ['Production Manager', 'manufacturing', 'manufacturing'],
  'technical product ra specialist': ['Regulatory Affairs Specialist', 'regulatory_quality', 'regulatory_affairs'],
  'cmc biopharma regulatory consultant — ecolab life sciences': ['Regulatory Affairs Specialist', 'regulatory_quality', 'regulatory_affairs'],
  'specialista doganale': ['Supply Chain Manager', 'manufacturing', 'supply_chain'],
  'principal statistician, global rare diseases': ['Biostatistician', 'clinical_operations', 'clinical_operations'],
  'sr specialist, capex process management': ['Accountant', 'support', 'finance'],
  'impiegata di segreteria': ['HR Business Partner', 'support', 'hr'],
  'geometra disegnatore': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'kering eyewear go-to-market specialist': ['Marketing Manager', 'marketing', 'marketing'],
  'supply chain planner': ['Supply Chain Manager', 'manufacturing', 'supply_chain'],
  'itero specialized territory manager': ['Area Manager Commercial', 'commercial', 'commercial'],
  'specialist, capex process management': ['Accountant', 'support', 'finance'],
  'congress administrator': ['Marketing Specialist', 'marketing', 'marketing'],
  'kering eyewear brand specialist': ['Brand Manager', 'marketing', 'marketing'],
  'quality control operator': ['Quality Control Analyst', 'regulatory_quality', 'quality'],
  'operational technology and manufacturing manager': ['Production Manager', 'manufacturing', 'manufacturing'],
  'quality assurance associate': ['Quality Assurance Specialist', 'regulatory_quality', 'quality'],
  'addetto/a vendita part time': ['Sales Specialist', 'commercial', 'commercial'],
  'addetto/a vendita': ['Sales Specialist', 'commercial', 'commercial'],
  'start-up specialist- fsp model - italy': ['Clinical Trial Administrator', 'clinical_operations', 'clinical_operations'],
  'product sales expert – specialty lab solutions (hematology and hemostasis) (m/f/d)': ['Product Specialist', 'commercial', 'commercial'],
  'autista patente c e cqc': ['Supply Chain Manager', 'manufacturing', 'supply_chain'],
  'ottici': ['Sales Specialist', 'commercial', 'commercial'],
  'meccanico e riparatore di veicoli a motore': ['Manutentore', 'manufacturing', 'manufacturing'],
  "addetta/o accettazione - part time 25h - casalecchio di reno (bo)": ['Addetto Accettazione', 'support', 'healthcare_services'],
  "specialista di accoglienza part time 30 ore settimanali - via sant'ambrogio, 13 - parabiago (mi)": ['Addetto Accettazione', 'support', 'healthcare_services'],
  'regulatory affairegulatory affairs associate - fix-term contractrs associate - temporary': ['Regulatory Affairs Specialist', 'regulatory_quality', 'regulatory_affairs'],
  'global treasury manager': ['Accountant', 'support', 'finance'],
  'engineering compliance expert - maternity replacement': ['Quality Assurance Manager', 'regulatory_quality', 'quality'],
  'sr. global technical consultant (f/m/d) pharma & personal care': ['Industry Technical Consultant', 'commercial', 'commercial'],
  'bowel management sales advisor': ['Product Specialist', 'commercial', 'commercial'],
  'technology transfer specialist': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'medical monitor (gastroenterology)': ['Medical Advisor', 'medical_affairs', 'medical_affairs'],
  'preparatore chimico': ['Manutentore', 'manufacturing', 'manufacturing'],
  'qa sterility assurance manager, nerviano site': ['Quality Assurance Manager', 'regulatory_quality', 'quality'],
  'commercial tools & metrics senior specialist': ['Product Specialist', 'commercial', 'commercial'],
  'sponsor dedicated site startup lead - italy': ['Clinical Trial Administrator', 'clinical_operations', 'clinical_operations'],
  'associate project engineering': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'product development technical experts': ['Research Scientist', 'scientific_rd', 'rd'],
  'senior hrbp': ['HR Business Partner', 'support', 'hr'],
  'digital strategy manager': ['Digital Marketing Manager', 'marketing', 'marketing'],
  'budget & contract lead': ['Clinical Trial Administrator', 'clinical_operations', 'clinical_operations'],
  'business developer biopharma (3 years experience)': ['Business Development Manager', 'business_development', 'business_development'],
  'study start up associate ii': ['Clinical Trial Administrator', 'clinical_operations', 'clinical_operations'],
  'hse expert': ['EHS/HSE Specialist', 'regulatory_quality', 'quality'],
  'm&a analyst': ['Accountant', 'support', 'finance'],
  'accounting & finance specialist': ['Accountant', 'support', 'finance'],
  'tecnologo/a di processo di sintesi chimica verona': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'field service engineering xray/dentale': ['Field Service Engineer', 'commercial', 'commercial'],
  'business developer biocidi&chemicals (3 years experience)': ['Business Development Manager', 'business_development', 'business_development'],
  'associate strategy & insights manager, neurovascular - emea': ['Marketing Manager', 'marketing', 'marketing'],
  'hair care global events manager': ['Marketing Specialist', 'marketing', 'marketing'],
  'senior program manager': ['General Manager', 'general_management', 'general_management'],
  'associate site manager': ['Clinical Trial Administrator', 'clinical_operations', 'clinical_operations'],
  'safety & vigilance officer': ['Pharmacovigilance Manager', 'regulatory_quality', 'drug_safety'],
  'analista m&a': ['Accountant', 'support', 'finance'],
  'field service engineering ultrasound': ['Field Service Engineer', 'commercial', 'commercial'],
  'kering eyewear ict security specialist': ['IT Specialist', 'it', 'it'],
  'kering eyewear industrialization specialist': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'sas programmer': ['Biostatistician', 'clinical_operations', 'clinical_operations'],
  'consulente autorizzazioni settore sanitario': ['Regulatory Affairs Specialist', 'regulatory_quality', 'regulatory_affairs'],
  'brand & comunication designer': ['Brand Manager', 'marketing', 'marketing'],
  'kering eyewear it senior analyst (sd)': ['IT Specialist', 'it', 'it'],
  'coordinatore/trice infermieristico': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'country approval specialist - fsp - italy': ['Regulatory Affairs Specialist', 'regulatory_quality', 'regulatory_affairs'],
  'data engineer': ['Data Analyst', 'it', 'it'],
  'medical research practitioner': ['Medical Advisor', 'medical_affairs', 'medical_affairs'],
  'cbia activation manager': ['Marketing Manager', 'marketing', 'marketing'],
  'marketing coordinator': ['Marketing Specialist', 'marketing', 'marketing'],
  'deploy sr analyst make qm': ['Quality Assurance Specialist', 'regulatory_quality', 'quality'],
  'senior field technical engineer - elettrofisiologia - sicilia': ['Field Service Engineer', 'commercial', 'commercial'],
  'coordinatore/trice infermieristico punti prelievo (emilia-romagna)': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'sponsor dedicated site startup lead': ['Clinical Trial Administrator', 'clinical_operations', 'clinical_operations'],
  'operatore collaudo': ['Quality Control Analyst', 'regulatory_quality', 'manufacturing'],
  'tender, pricing & market intelligence coordinator italy': ['Tender Office Specialist', 'market_access', 'market_access'],
  'contract specialist - fsp - italy': ['Clinical Trial Administrator', 'clinical_operations', 'clinical_operations'],
  'corporate it salesforce manager': ['IT Specialist', 'it', 'it'],
  'welding coordinator support': ['Manutentore', 'manufacturing', 'manufacturing'],
  'anestesista': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'system specialist, north east italy': ['Industry Technical Consultant', 'commercial', 'commercial'],
  'pharmacology laboratory technician': ['Research Scientist', 'scientific_rd', 'rd'],
  'hr amministrazione personale': ['HR Business Partner', 'support', 'hr'],
  'i.t. business solutions engineer': ['IT Specialist', 'it', 'it'],
  'se cbia activation manager': ['Marketing Manager', 'marketing', 'marketing'],
  'engineering compliance expert': ['Quality Assurance Manager', 'regulatory_quality', 'quality'],
  'aso appartenente alle cat-pro l.68/99': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'responsabile amministrativo/a': ['Accountant', 'support', 'finance'],
  'sr director and team lead, regulatory labelling strategy and development, oncology': ['Regulatory Affairs Manager', 'regulatory_quality', 'regulatory_affairs'],
  'digital health specialist': ['Product Specialist', 'commercial', 'commercial'],
  'clinical trial administrator': ['Clinical Trial Administrator', 'clinical_operations', 'clinical_operations'],
  'distribution manager': ['Supply Chain Manager', 'manufacturing', 'supply_chain'],
  'specialista applicazioni': ['Industry Technical Consultant', 'commercial', 'commercial'],
  'chemical compliance lead': ['Regulatory Affairs Specialist', 'regulatory_quality', 'regulatory_affairs'],
  'fleet analyst - 6-month fixed-term contract': ['Supply Chain Manager', 'manufacturing', 'supply_chain'],
  'tenico ventiloterapia -palermo': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'tenders specialist': ['Tender Office Specialist', 'market_access', 'market_access'],
  'technical documentation': ['Quality Assurance Specialist', 'regulatory_quality', 'quality'],
  'global technical consultant': ['Industry Technical Consultant', 'commercial', 'commercial'],
  'tecnico di manutenzione elettrostrumentale': ['Manutentore', 'manufacturing', 'manufacturing'],
  'robotics engineer': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'product development project leader': ['Research Scientist', 'scientific_rd', 'rd'],
  'export area manager - professional haircare': ['Area Manager Commercial', 'commercial', 'commercial'],
  'manager, business enablement, value generation & optimization': ['General Manager', 'general_management', 'general_management'],
  'tecnico': ['EHS/HSE Specialist', 'regulatory_quality', 'quality']
  // 'maître di sala' escluso volutamente (fuori ambito Life Sciences)
};

async function run() {
  console.log('🔧 MAPPATURA FINALE DEI TITOLI NON MAPPATI\n');
  console.log('═'.repeat(80));

  // STEP 0: elimina "Maître di sala"
  console.log('\n0️⃣  ELIMINAZIONE "Maître di sala"...');
  const { data: maitre } = await supabase.from('job_listings').select('id, company_name').ilike('job_title', '%Ma%tre di sala%');
  for (const m of maitre || []) {
    await supabase.from('job_listings').delete().eq('id', m.id);
    console.log(`   ✅ Eliminato (${m.company_name})`);
  }

  // STEP 1: aggiungi job_aliases (uno per ogni titolo distinto mappato)
  console.log('\n1️⃣  INSERIMENTO job_aliases...');
  let aliasInserted = 0, aliasSkipped = 0;
  for (const [aliasLower, [canonical_role, role_family, functional_area]] of Object.entries(M)) {
    const { data: existing } = await supabase.from('job_aliases').select('id').ilike('alias', aliasLower);
    if (existing && existing.length) { aliasSkipped++; continue; }

    // Recupera il job_title originale (case reale) da job_listings per salvare l'alias leggibile
    const { data: sample } = await supabase.from('job_listings').select('job_title').ilike('job_title', aliasLower).limit(1);
    const aliasText = sample?.[0]?.job_title || aliasLower;

    const { error } = await supabase.from('job_aliases').insert({
      alias: aliasText, canonical_role, role_family, functional_area
    });
    if (!error) aliasInserted++;
  }
  console.log(`   ✅ Alias inseriti: ${aliasInserted} | Già presenti: ${aliasSkipped}`);

  // STEP 2: applica a job_listings (match case-insensitive esatto sul titolo)
  console.log('\n2️⃣  AGGIORNAMENTO job_listings...');
  let updated = 0;
  for (const [aliasLower, [canonical_role, role_family, functional_area]] of Object.entries(M)) {
    const { data: jobs } = await supabase.from('job_listings').select('id, canonical_role, functional_area_v2').ilike('job_title', aliasLower);
    for (const job of jobs || []) {
      const patch = {};
      if (!job.canonical_role) { patch.canonical_role = canonical_role; patch.role_family = role_family; }
      if (!job.functional_area_v2) patch.functional_area_v2 = functional_area;
      if (Object.keys(patch).length) {
        await supabase.from('job_listings').update(patch).eq('id', job.id);
        updated++;
      }
    }
  }
  console.log(`   ✅ Annunci aggiornati: ${updated}`);

  // STEP 3: stato finale
  console.log('\n3️⃣  STATO FINALE...');
  const { count: totalJobs } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
  const { count: withFA } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('functional_area_v2', 'is', null);
  const { count: withRole } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('canonical_role', 'is', null);
  console.log(`   Totale annunci: ${totalJobs}`);
  console.log(`   Con functional_area_v2: ${withFA} (${((withFA/totalJobs)*100).toFixed(1)}%)`);
  console.log(`   Con canonical_role: ${withRole} (${((withRole/totalJobs)*100).toFixed(1)}%)`);

  console.log('\n' + '═'.repeat(80));
  console.log('\n✨ Fatto.\n');
}

run();
