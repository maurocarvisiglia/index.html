// Stessa famiglia di bug gia' corretta per l'HR (vedi fix-hr-classification.js),
// trovata durante la diagnosi pre-import del 01/09/2026 su altri 2 canonical_role
// usati come calderone: "General Manager" e "Quality Assurance Specialist".
// "Process Engineer" e "Sales Specialist" sono stati esaminati ma NON toccati:
// sono bucket ampi ma coerenti (ruoli davvero di ingegneria/vendita), non un
// errore di catalogazione — solo poco granulari.
//
// node scripts/fix-catchall-aliases.js --dry-run
// node scripts/fix-catchall-aliases.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DRY_RUN = process.argv.includes('--dry-run');

// ══ job_aliases da eliminare (ridondanti o titoli troppo generici/non pertinenti) ══
const ALIASES_TO_DELETE = [
  'Project Manager', // gia' canonical_role valido in job_taxonomy — l'alias lo oscurava
  'GMP Specialist',  // idem
  'Supplier Quality Engineer', // idem
  'Impiegato/a Categorie Protette', // troppo generico, nessun segnale di funzione
  'Impiegato/a Amministrativo/a', // idem
  "Addetto/a Gestione Casse e Versamenti (L.68/99 art.1)", // cassiere, non QA
  'Segretario/segretaria', // segreteria generica, non QA
  'Segreteria amministrativa', // idem
  'Office & Facility Assistant', // troppo generico
  'Responsabile di sala', // ruolo di sala (ristorazione/retail), non pertinente
  'Service Technician Pest' // pest control, fuori perimetro
];

// ══ job_aliases da ripuntare a un canonical_role/functional_area corretto ══
const ALIASES_TO_REPOINT = {
  'Manager, PMO': {canonical_role:'Project Manager', functional_area:'general_management', role_family:'general_management'},
  'Transcend Senior Manager PMO': {canonical_role:'Project Manager', functional_area:'general_management', role_family:'general_management'},
  'Senior Program Manager': {canonical_role:'Project Manager', functional_area:'general_management', role_family:'general_management'},
  'Executive Assistant & Office Manager - Temporary (1 Year)': {canonical_role:'Project Manager', functional_area:'general_management', role_family:'general_management'},

  'Cybersecurity & Networking Specialist': {canonical_role:'IT Specialist', functional_area:'it', role_family:'it'},
  'GMP Compliance Junior Specialist': {canonical_role:'GMP Specialist', functional_area:'quality', role_family:'regulatory_quality'},
  'Junior EHS Specialist': {canonical_role:'EHS/HSE Specialist', functional_area:'quality', role_family:'regulatory_quality'},
  'Senior Technician in Advanced Electron Microscopy': {canonical_role:'Laboratory Researcher', functional_area:'rd', role_family:'scientific_rd'},
  'Addetto/a allo Smistamento e Allestimento dei Campioni Citologici - Laboratorio Veterinario': {canonical_role:'Tecnico di Laboratorio', functional_area:'healthcare_services', role_family:'support'},
  'Impiegato amministrativo contabile': {canonical_role:'Accountant', functional_area:'finance', role_family:'support'},
  'Software System Tester': {canonical_role:'Software Engineer', functional_area:'it', role_family:'it'},
  'Software & Firmware Engineer (collaudo)': {canonical_role:'Software Engineer', functional_area:'it', role_family:'it'},
  'Assembler': {canonical_role:'Operatore di Produzione', functional_area:'manufacturing', role_family:'manufacturing'},
  'Addetto/a alla Segreteria e alla Gestione delle Attività Formative': {canonical_role:'Learning & Development Specialist', functional_area:'hr', role_family:'support'},
  'Animal Facility Technician': {canonical_role:'Laboratory Researcher', functional_area:'rd', role_family:'scientific_rd'}
};

async function main(){
  console.log(DRY_RUN ? '🔎 DRY RUN — nessuna scrittura\n' : '⚠️  MODALITA\' REALE\n');

  console.log('=== job_aliases ===');
  for(const alias of ALIASES_TO_DELETE){
    console.log(`DELETE alias "${alias}"`);
    if(!DRY_RUN){
      const {error} = await supabase.from('job_aliases').delete().eq('alias',alias);
      if(error) console.error('  errore:',error.message);
    }
  }
  for(const [alias,target] of Object.entries(ALIASES_TO_REPOINT)){
    console.log(`UPDATE alias "${alias}" -> canonical_role="${target.canonical_role}", functional_area="${target.functional_area}"`);
    if(!DRY_RUN){
      const {error} = await supabase.from('job_aliases').update({canonical_role:target.canonical_role,functional_area:target.functional_area,role_family:target.role_family}).eq('alias',alias);
      if(error) console.error('  errore:',error.message);
    }
  }

  // ══ job_listings storici: ripete la correzione sulle righe gia' salvate con il vecchio valore ══
  console.log('\n=== job_listings (retroattivo) ===');
  const OLD_ROLES = ['General Manager','Quality Assurance Specialist'];
  const { data: rows } = await supabase.from('job_listings').select('id,job_title,canonical_role,functional_area_v2').in('canonical_role',OLD_ROLES);
  console.log(`Righe attuali con canonical_role in [${OLD_ROLES.join(', ')}]: ${rows.length}`);

  const REPOINT_BY_TITLE = {};
  for(const [alias,target] of Object.entries(ALIASES_TO_REPOINT)) REPOINT_BY_TITLE[alias.trim().toLowerCase()] = target;
  const DELETE_TITLES = new Set(ALIASES_TO_DELETE.map(a=>a.trim().toLowerCase()));

  let changed=0, leftAsIs=0, nulledOut=0;
  for(const r of rows){
    const key = r.job_title.trim().toLowerCase();
    if(REPOINT_BY_TITLE[key]){
      const t = REPOINT_BY_TITLE[key];
      console.log(`"${r.job_title}": canonical_role ${r.canonical_role}->${t.canonical_role}, functional_area_v2 ${r.functional_area_v2}->${t.functional_area}`);
      changed++;
      if(!DRY_RUN){
        const {error} = await supabase.from('job_listings').update({canonical_role:t.canonical_role,functional_area_v2:t.functional_area}).eq('id',r.id);
        if(error) console.error('  errore:',error.message);
      }
    } else if(DELETE_TITLES.has(key)){
      console.log(`"${r.job_title}": canonical_role ${r.canonical_role}->null (troppo generico, resta functional_area_v2=${r.functional_area_v2})`);
      nulledOut++;
      if(!DRY_RUN){
        const {error} = await supabase.from('job_listings').update({canonical_role:null,role_family:null}).eq('id',r.id);
        if(error) console.error('  errore:',error.message);
      }
    } else {
      leftAsIs++;
    }
  }
  console.log(`\nCambiati: ${changed} | Azzerati (troppo generici): ${nulledOut} | Lasciati invariati (corretti): ${leftAsIs}`);

  if(!DRY_RUN){
    const { data: after } = await supabase.from('job_listings').select('canonical_role').in('canonical_role',OLD_ROLES);
    console.log(`\n✅ Righe ancora con canonical_role in [${OLD_ROLES.join(', ')}] dopo la correzione: ${after.length}`);
  }
}
main();
