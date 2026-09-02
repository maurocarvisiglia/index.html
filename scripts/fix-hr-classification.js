// Corregge alla radice due bug di classificazione trovati nell'area HR:
//
// 1) job_aliases: 18 alias puntavano tutti a canonical_role='HR Business Partner',
//    incluse le stringhe letterali "HR Manager" e "HR Specialist" (gia' presenti
//    come canonical_role validi in job_taxonomy) e 2 titoli non-HR (segreteria
//    didattica, segreteria generica). Siccome normalizeJobTitle() controlla gli
//    alias PRIMA della tassonomia, questi alias sbagliati non si sarebbero mai
//    corretti da soli.
//
// 2) functional_area_v2='hr': 23 annunci su 52 non sono ruoli HR (reception,
//    infermieri, QA/archivio, customer service, segreterie generiche) — finiti li'
//    perche' i prompt AI di analyzeWithText()/analyzeOneListing() in index.html
//    non includevano le categorie healthcare_services/legal/customer_service
//    nell'enum (gia' corretto separatamente in index.html).
//
// Diagnosticato il 31/08/2026 durante la costruzione del report HRBP.
//
// node scripts/fix-hr-classification.js --dry-run   (solo report, nessuna scrittura)
// node scripts/fix-hr-classification.js             (applica)
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DRY_RUN = process.argv.includes('--dry-run');

// ══ 1) job_aliases: alias da eliminare (ridondanti o non-HR) ══
const ALIASES_TO_DELETE = [
  'HR Manager',   // gia' canonical_role valido in job_taxonomy — l'alias lo oscurava
  'HR Specialist', // idem
  'Addetto/a segreteria didattica', // non e' HR
  'Impiegata di segreteria' // non e' HR (generico, dipende dall'azienda)
];

// ══ 1b) job_aliases: alias da ripuntare al canonical_role corretto ══
const ALIASES_TO_REPOINT = {
  'HR Specialist': null, // vedi sopra, eliminato non ripuntato
  'Jr.  Payroll & Administration': 'HR Specialist',
  'Impiegato/a risorse umane': 'HR Specialist',
  'HR Amministrazione Personale': 'HR Specialist',
  'Addetto/a alla Gestione del Personale': 'HR Specialist',
  'KERING EYEWEAR HR Admin Specialist (Fixed Term Contract)': 'HR Specialist',
  'Hr administration specialist': 'HR Specialist',
  'Fachkraft für die Lohnabrechnung / Lohnbuchhaltung (m/w/d)': 'HR Specialist',
  'Compensation & Benefits and HR Administration Manager': 'HR Manager',
  'Head of People & Labour Relations Italy (9-month Fixed Term Contract)': 'HR Manager',
  'HR Site Lead, Manufacturing': 'HR Manager',
  'Senior Manager, HR Site Manager': 'HR Manager',
  'People & Culture Director Ivoclar Italy (all genders)': 'HR Manager'
};
// Restano invariati (gia' corretti): 'Senior HRBP', 'HR Generalist' -> HR Business Partner

// ══ 2) job_listings: correzioni dirette per id, precedenti verificati nel DB ══
// {functional_area_v2, canonical_role} — undefined = non toccare quel campo
const LISTING_FIXES = {
  '7136b2e0-7dc8-44ed-b66f-81303ecbaba8': {functional_area_v2:'healthcare_services'}, // Addetta/o Accoglienza e Accettazione Clienti - Synlab
  'd6f8aa76-6b99-4c70-9a49-3e45f1f2d8ba': {functional_area_v2:'healthcare_services'}, // Specialista di accoglienza - Synlab
  'db473d6f-323f-4d01-9db2-dcca117f6504': {functional_area_v2:'customer_service'},    // Temporary Customer Service Technician - Kedrion
  '12b825f7-aacb-4b6c-b38c-ef7e2f402997': {canonical_role:'Learning & Development Specialist'}, // Addetto/a segreteria didattica - Tharsos (resta hr)
  '69e3760f-201a-445d-bae5-f3ffd13177bd': {functional_area_v2:'healthcare_services'}, // Addetta/o Accettazione Cat.Protetta - Synlab
  '54d52429-f7eb-4574-9613-6e4bc2dd8c1f': {functional_area_v2:'general_management', canonical_role:'Project Manager'}, // Impiegata di segreteria - Centro oculistico
  '72ee95b4-2022-4eb8-a733-6a8add5d2a7d': {functional_area_v2:'quality'}, // Docente Attrezzature Lavoro e Impiegato Tecnico - Aquarius (EHS)
  '3097363e-0ea3-4d46-9b2e-55a139221ed9': {functional_area_v2:'healthcare_services'}, // Operatore socio-sanitario - Opera della provvidenza
  '2cb28e70-3bac-4182-bea2-7271ca4697e7': {functional_area_v2:'quality'}, // ARCHIVIST Protected Category - Philogen
  '9c5fa3bb-1539-446f-af05-3895abf5a407': {functional_area_v2:'general_management', canonical_role:'Project Manager'}, // Segretaria amministrativa - F.I.M.O.
  '6c892546-a01f-4fef-880b-1bfd91b7e55a': {functional_area_v2:'general_management', canonical_role:'Project Manager'}, // Segreteria Amministrativa/Generale - Falorni
  '69da954b-f51d-4950-bccf-2c4c0ad65a44': {functional_area_v2:'healthcare_services'}, // Front Office Specialist Sost.Maternita - Bianalisi
  'de08d7e3-61c6-4fcd-b9ba-51a4dcb3c2d8': {functional_area_v2:'healthcare_services'}, // Segreteria Medicina del Lavoro - Cerba
  '0505fa72-2005-4b8e-8745-13ad791e2d9f': {functional_area_v2:'healthcare_services'}, // Infermiere settore Medicina del Lavoro
  '51063120-ff17-48b1-af51-9b061965723e': {functional_area_v2:'general_management'}, // KERING EYEWEAR Executive Assistant
  'e6ce190f-4967-4076-ba73-0494bc26a5c7': {functional_area_v2:'commercial'}, // Addetti/e al Back Office - Luxottica
  '52b7f7f0-6453-41a7-9e8f-a859d0dd9738': {functional_area_v2:'customer_service'}, // Receptionist - Gilardoni
  'cba2d628-cadb-40f4-b04e-598c500fa8ea': {canonical_role:'Learning & Development Specialist'}, // Segreteria Gestione Attivita Formative - Seform (resta hr)
  '1e04f7f5-6a36-451a-b609-6c0ad2e6f651': {functional_area_v2:'quality'}, // Tecnico sicurezza sul lavoro (HSE) - Gip studio
  '426e03ff-a96f-4471-9781-36a650e39bd8': {functional_area_v2:'healthcare_services'}, // Infermiere/a di Dialisi - Fresenius
  '183ef9d0-476c-4785-80e4-9fb9cc5cf43d': {functional_area_v2:'general_management', canonical_role:null}, // Impiegato/a Categorie Protette - Philogen
  '1f2e99a2-9adf-4d50-b655-85c4fdbf981e': {functional_area_v2:null, canonical_role:null}, // Educatore progetti scolastica - non pertinente al dataset
  'a50d3b79-a704-46df-a4e0-453d27a4e375': {functional_area_v2:'general_management', canonical_role:'Project Manager'}, // Segretario/segretaria - Madrigal
  // canonical_role='HR Business Partner' fuori dal set functional_area='hr'
  '0116dcfd-db86-4c6d-93bb-7a9feba2ae5d': {canonical_role:'HR Specialist'} // Lohnabrechnung/Lohnbuchhaltung - Interconsult (resta finance)
};

async function main(){
  console.log(DRY_RUN ? '🔎 DRY RUN — nessuna scrittura\n' : '⚠️  MODALITA\' REALE\n');

  // ── 1) job_aliases ──
  console.log('=== job_aliases ===');
  for(const alias of ALIASES_TO_DELETE){
    console.log(`DELETE alias "${alias}"`);
    if(!DRY_RUN){
      const {error} = await supabase.from('job_aliases').delete().eq('alias',alias);
      if(error) console.error('  errore:',error.message);
    }
  }
  for(const [alias,newRole] of Object.entries(ALIASES_TO_REPOINT)){
    if(newRole===null) continue;
    console.log(`UPDATE alias "${alias}" -> canonical_role="${newRole}"`);
    if(!DRY_RUN){
      const {error} = await supabase.from('job_aliases').update({canonical_role:newRole}).eq('alias',alias);
      if(error) console.error('  errore:',error.message);
    }
  }

  // ── 2) job_listings ──
  console.log('\n=== job_listings ===');
  const ids = Object.keys(LISTING_FIXES);
  const { data: current } = await supabase.from('job_listings').select('id,job_title,functional_area_v2,canonical_role').in('id',ids);
  const byId = Object.fromEntries((current||[]).map(l=>[l.id,l]));

  for(const id of ids){
    const fix = LISTING_FIXES[id];
    const cur = byId[id];
    if(!cur){ console.warn(`⚠️ id non trovato: ${id}`); continue; }
    const changes = [];
    if('functional_area_v2' in fix && fix.functional_area_v2!==cur.functional_area_v2) changes.push(`functional_area_v2: ${cur.functional_area_v2} -> ${fix.functional_area_v2}`);
    if('canonical_role' in fix && fix.canonical_role!==cur.canonical_role) changes.push(`canonical_role: ${cur.canonical_role} -> ${fix.canonical_role}`);
    if(!changes.length){ console.log(`(invariato) ${cur.job_title}`); continue; }
    console.log(`"${cur.job_title}": ${changes.join(', ')}`);
    if(!DRY_RUN){
      const patch = {};
      if('functional_area_v2' in fix) patch.functional_area_v2 = fix.functional_area_v2;
      if('canonical_role' in fix) patch.canonical_role = fix.canonical_role;
      const {error} = await supabase.from('job_listings').update(patch).eq('id',id);
      if(error) console.error('  errore:',error.message);
    }
  }

  // ── 3) verifica finale: canonical_role='HR Business Partner' dopo la correzione ──
  if(!DRY_RUN){
    const { data: after } = await supabase.from('job_listings').select('job_title,company_name').eq('canonical_role','HR Business Partner');
    console.log(`\n✅ canonical_role='HR Business Partner' ora conta ${after.length} annunci (era 22):`);
    after.forEach(r=>console.log(' -', r.job_title, '|', r.company_name));

    const { data: hrArea } = await supabase.from('job_listings').select('job_title').eq('functional_area_v2','hr');
    console.log(`\n✅ functional_area_v2='hr' ora conta ${hrArea.length} annunci (era 52)`);
  }
}
main();
