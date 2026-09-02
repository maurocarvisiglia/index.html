// Completa fix-hr-classification.js: gli UPDATE su job_aliases valgono solo per
// le classificazioni FUTURE (normalizeJobTitle legge la cache alias). Gli annunci
// GIA' salvati con canonical_role='HR Business Partner' per via del vecchio alias
// vanno corretti direttamente qui.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DRY_RUN = process.argv.includes('--dry-run');

const REPOINT = {
  'jr.  payroll & administration': 'HR Specialist',
  'impiegato/a risorse umane': 'HR Specialist',
  'hr amministrazione personale': 'HR Specialist',
  'addetto/a alla gestione del personale': 'HR Specialist',
  'kering eyewear hr admin specialist (fixed term contract)': 'HR Specialist',
  'hr administration specialist': 'HR Specialist',
  'compensation & benefits and hr administration manager': 'HR Manager',
  'head of people & labour relations italy (9-month fixed term contract)': 'HR Manager',
  'hr site lead, manufacturing': 'HR Manager',
  'senior manager, hr site manager': 'HR Manager',
  'people & culture director ivoclar italy (all genders)': 'HR Manager',
  'hr manager italy ep/nv & project management': 'HR Manager',
  'global talent development lead': 'Learning & Development Specialist' // Talent Development, non business-partnering — nessun alias lo copriva
};

async function main(){
  console.log(DRY_RUN ? '🔎 DRY RUN\n' : '⚠️  MODALITA\' REALE\n');

  console.log('=== nuovo alias (non copriva nessun alias esistente) ===');
  console.log('INSERT job_aliases "Global Talent development lead" -> Learning & Development Specialist');
  if(!DRY_RUN){
    const {error} = await supabase.from('job_aliases').insert({alias:'Global Talent development lead',canonical_role:'Learning & Development Specialist',role_family:'support',functional_area:'hr'});
    if(error) console.error('  errore:',error.message);
  }

  const { data: rows } = await supabase.from('job_listings').select('id,job_title,canonical_role').eq('canonical_role','HR Business Partner');
  console.log('canonical_role=HR Business Partner attuali:', rows.length);
  for(const r of rows){
    const key = r.job_title.trim().toLowerCase();
    const target = REPOINT[key];
    if(!target){ console.log(`(resta HR Business Partner) ${r.job_title}`); continue; }
    console.log(`"${r.job_title}" -> ${target}`);
    if(!DRY_RUN){
      const {error} = await supabase.from('job_listings').update({canonical_role:target}).eq('id',r.id);
      if(error) console.error('  errore:',error.message);
    }
  }
  if(!DRY_RUN){
    const { data: after } = await supabase.from('job_listings').select('job_title,company_name').eq('canonical_role','HR Business Partner');
    console.log(`\n✅ canonical_role='HR Business Partner' ora conta ${after.length} annunci:`);
    after.forEach(r=>console.log(' -', r.job_title, '|', r.company_name));
  }
}
main();
