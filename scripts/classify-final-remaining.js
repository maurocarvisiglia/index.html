import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Mappatura specifica per titolo esatto (non-Direttore, non-Farmacista generico)
const M = {
  'front office specialist': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'front office specialist poliambulatorio (l.68/99 art. 1)': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'supply chain operational excellence lead': ['Supply Chain Manager', 'manufacturing', 'supply_chain'],
  'senior quality assurance gdp specialist': ['Quality Assurance Specialist', 'regulatory_quality', 'quality'],
  'specialist, labelling & compliance regulatory affairs, global rare diseases': ['Regulatory Affairs Specialist', 'regulatory_quality', 'regulatory_affairs'],
  'infermiere/a di nefrologia': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'senior manager, cmc regulatory affairs, global rare diseases': ['Regulatory Affairs Manager', 'regulatory_quality', 'regulatory_affairs'],
  "district manager women's health": ['Area Manager Commercial', 'commercial', 'commercial'],
  'executive assistant & office manager - temporary': ['General Manager', 'general_management', 'general_management'],
  'executive assistant & office manager - temporary (1 year)': ['General Manager', 'general_management', 'general_management'],
  'area manager': ['Area Manager Commercial', 'commercial', 'commercial'],
  'soccorritore 118 capo equipaggio': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'deputy chief medical officer': ['Medical Director', 'medical_affairs', 'medical_affairs'],
  'manutenzione': ['Manutentore', 'manufacturing', 'manufacturing'],
  'responsabile di filiale': ['Field Sales Manager', 'commercial', 'commercial'],
  'tecnico trasfertista mondo': ['Field Service Engineer', 'commercial', 'commercial'],
  'isf gastro primary care milano': ['Informatore Scientifico del Farmaco', 'commercial', 'commercial'],
  'assistente al direttore lavori': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'podologo': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'territory manager consumables and iol - lombardy': ['Area Manager Commercial', 'commercial', 'commercial'],
  'geometra di cantiere': ['Process Engineer', 'manufacturing', 'manufacturing'],
  'manager, cmc regulatory affairs, global rare diseases': ['Regulatory Affairs Manager', 'regulatory_quality', 'regulatory_affairs'],
  'sr. manager, legal global supply chain': ['Legal Counsel', 'general_management', 'legal'],
  'avvocato specializzato in diritto societario e contrattualistica': ['Legal Counsel', 'general_management', 'legal'],
  'assistant store manager': ['Sales Specialist', 'commercial', 'commercial'],
  'manager, eu & international regulatory affairs, global rare diseases': ['Regulatory Affairs Manager', 'regulatory_quality', 'regulatory_affairs'],
  'junior quality assurance (qa) - laboratorio residui e chimico-fisico (glp)': ['Quality Assurance Specialist', 'regulatory_quality', 'quality'],
  'educatore per progetti nella scolastica': ['HR Business Partner', 'support', 'hr'],
  'postdoctoral position in rna technologies flagship aso_rna: subpopulation-guided aso strategies for targeted cancer therapy': ['Research Scientist', 'scientific_rd', 'rd'],
  'msl gyn/gu (sostituzione maternità)': ['Medical Science Liaison', 'medical_affairs', 'medical_affairs'],
  'segretario/segretaria': ['HR Business Partner', 'support', 'hr'],
  'franchise head – immunology alliance': ['Area Manager Commercial', 'commercial', 'commercial'],
  'quality assurance supervisor': ['Quality Assurance Manager', 'regulatory_quality', 'quality'],
  'quality control engineer': ['Quality Control Analyst', 'regulatory_quality', 'quality'],
  'data quality lead / data management lead - oncology': ['Clinical Trial Administrator', 'clinical_operations', 'clinical_operations'],
  'infermiere/a': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'addetto/a al magazzino': ['Supply Chain Manager', 'manufacturing', 'supply_chain'],
  'managing director': ['General Manager', 'general_management', 'general_management'],
  'assistant store manager ottico': ['Sales Specialist', 'commercial', 'commercial'],
  'quality control supervisor': ['Quality Control Analyst', 'regulatory_quality', 'quality'],
  'quality assurance': ['Quality Assurance Specialist', 'regulatory_quality', 'quality'],
  'quality assurance trainee': ['Quality Assurance Specialist', 'regulatory_quality', 'quality'],
  'ottico/a': ['Sales Specialist', 'commercial', 'commercial'],
  'clinical research physician': ['Clinical Research Associate (CRA)', 'clinical_operations', 'clinical_operations'],
  'fisioterapista libero professionista /a tempo determinato': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'responsabile di magazzino e logistica': ['Supply Chain Manager', 'manufacturing', 'supply_chain'],
  'infermiere/a di dialisi - fiumicino (rm)': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'customer service specialist - esphora project': ['Customer Service Specialist', 'support', 'customer_service'],
  'project manager': ['General Manager', 'general_management', 'general_management'],
  'infermiere/a ambulatorio di endoscopia': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'customer service estero': ['Customer Service Specialist', 'support', 'customer_service'],
  'autista soccorritore e soccorritore': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'territory manager': ['Area Manager Commercial', 'commercial', 'commercial'],
  'tecnico sanitario di radiologia medica': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'quality control (qc) manager': ['Quality Assurance Manager', 'regulatory_quality', 'quality'],
  'customer service': ['Customer Service Specialist', 'support', 'customer_service'],
  'director, global leadership, talent development & learning': ['HR Business Partner', 'support', 'hr'],
  'fisioterapista': ['Addetto Accettazione', 'support', 'healthcare_services'],
  'assistant shop manager': ['Sales Specialist', 'commercial', 'commercial'],
  'risk management expert': ['Accountant', 'support', 'finance'],
  'head of legal and compliance italy': ['Legal Counsel', 'general_management', 'legal'],
  'store manager': ['Field Sales Manager', 'commercial', 'commercial'],
  'office & facility assistant': ['General Manager', 'general_management', 'general_management'],
  'segreteria amministrativa / generale': ['HR Business Partner', 'support', 'hr'],
  'executive assistant': ['General Manager', 'general_management', 'general_management'],
  'direttore generale': ['General Manager', 'general_management', 'general_management'],
  'associate director - legal & compliance': ['Legal Counsel', 'general_management', 'legal']
  // 'chimico/a' (contesto farmacia) e 'addetto alla ristorazione' esclusi: fuori ambito o troppo simili a Farmacista retail
};

async function run() {
  console.log('🔧 CLASSIFICAZIONE FINALE DEI RIMANENTI\n');
  console.log('═'.repeat(80));

  // STEP 1: pattern "Direttore/Direttrice" (farmacia) -> general_management
  console.log('\n1️⃣  PATTERN "Direttore/Direttrice" (farmacia) → general_management...');
  const { data: direttori } = await supabase
    .from('job_listings')
    .select('id, job_title, canonical_role, functional_area_v2')
    .is('functional_area_v2', null)
    .or('job_title.ilike.%Direttore/Direttrice%,job_title.ilike.%Direttore/trice%');

  let dCount = 0;
  for (const j of direttori || []) {
    const patch = { functional_area_v2: 'general_management' };
    if (!j.canonical_role) { patch.canonical_role = 'Farmacista Direttore'; patch.role_family = 'general_management'; }
    await supabase.from('job_listings').update(patch).eq('id', j.id);
    dCount++;
  }
  console.log(`   ✅ Aggiornati: ${dCount}`);

  // Aggiungi 2 alias rappresentativi per il pattern
  for (const alias of ['Direttore/Direttrice di Farmacia', 'Direttore/Direttrice']) {
    const { data: ex } = await supabase.from('job_aliases').select('id').ilike('alias', alias);
    if (!ex || !ex.length) {
      await supabase.from('job_aliases').insert({ alias, canonical_role: 'Farmacista Direttore', role_family: 'general_management', functional_area: 'general_management' });
    }
  }

  // STEP 1b: pattern "Farmacista" (non Direttore, non ancora classificato) -> healthcare_services
  console.log('\n1️⃣b PATTERN "Farmacista" (retail, non Direttore) → healthcare_services...');
  const { data: farmacisti } = await supabase
    .from('job_listings')
    .select('id, job_title, canonical_role, functional_area_v2')
    .is('functional_area_v2', null)
    .ilike('job_title', '%farmacist%');

  let fCount = 0;
  for (const j of farmacisti || []) {
    const patch = { functional_area_v2: 'healthcare_services' };
    if (!j.canonical_role) { patch.canonical_role = 'Farmacista'; patch.role_family = 'support'; }
    await supabase.from('job_listings').update(patch).eq('id', j.id);
    fCount++;
  }
  console.log(`   ✅ Aggiornati: ${fCount}`);

  for (const alias of ['Farmacista', 'Farmacista Collaboratore/trice', 'Farmacista collaboratore/trice']) {
    const { data: ex } = await supabase.from('job_aliases').select('id').ilike('alias', alias);
    if (!ex || !ex.length) {
      await supabase.from('job_aliases').insert({ alias, canonical_role: 'Farmacista', role_family: 'support', functional_area: 'healthcare_services' });
    }
  }

  // Anche "Chimico/a" in contesto farmacia (stesso ruolo retail) -> healthcare_services
  const { data: chimico } = await supabase
    .from('job_listings')
    .select('id, canonical_role')
    .is('functional_area_v2', null)
    .ilike('job_title', 'Chimico/a');
  for (const j of chimico || []) {
    const patch = { functional_area_v2: 'healthcare_services' };
    if (!j.canonical_role) { patch.canonical_role = 'Farmacista'; patch.role_family = 'support'; }
    await supabase.from('job_listings').update(patch).eq('id', j.id);
  }

  // STEP 2: mappatura specifica per titolo esatto
  console.log('\n2️⃣  MAPPATURA TITOLI SPECIFICI...');
  let aliasInserted = 0, jobsUpdated = 0;
  for (const [aliasLower, [canonical_role, role_family, functional_area]] of Object.entries(M)) {
    const { data: ex } = await supabase.from('job_aliases').select('id').ilike('alias', aliasLower);
    if (!ex || !ex.length) {
      const { data: sample } = await supabase.from('job_listings').select('job_title').ilike('job_title', aliasLower).limit(1);
      const aliasText = sample?.[0]?.job_title || aliasLower;
      const { error } = await supabase.from('job_aliases').insert({ alias: aliasText, canonical_role, role_family, functional_area });
      if (!error) aliasInserted++;
    }

    const { data: jobs } = await supabase.from('job_listings').select('id, canonical_role, functional_area_v2').ilike('job_title', aliasLower);
    for (const job of jobs || []) {
      const patch = {};
      if (!job.canonical_role) { patch.canonical_role = canonical_role; patch.role_family = role_family; }
      if (!job.functional_area_v2) patch.functional_area_v2 = functional_area;
      if (Object.keys(patch).length) {
        await supabase.from('job_listings').update(patch).eq('id', job.id);
        jobsUpdated++;
      }
    }
  }
  console.log(`   ✅ Alias inseriti: ${aliasInserted} | Annunci aggiornati: ${jobsUpdated}`);

  console.log('\n' + '═'.repeat(80));
  console.log('\n✨ Fatto.\n');
}

run();
