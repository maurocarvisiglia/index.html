import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DRY_RUN = process.argv.includes('--dry-run');

const ALIASES = [
  ['Sales Partner | Spine (Centro Italia)', 'Clinical Sales Specialist', 'commercial', 'commercial'],
  ['Field Customer Engagement Partner - South Italy (Fixed Term)', 'Product Specialist', 'commercial', 'commercial'],
  ['Commercial Solutions Manager – Ireland', 'Sales Manager', 'commercial', 'commercial'],
  ['Account Executive Laboratory Solutions (m/f/d) Liguria, Italy', 'Key Account Manager', 'commercial', 'commercial'],
  ['Account Executive Laboratory Solutions - Puglia/Basilicata  (m/f/d) Italy', 'Key Account Manager', 'commercial', 'commercial'],
  ['E-commerce Sales Expert', 'Sales Specialist', 'commercial', 'commercial'],
  ['Addetto/a Gestione Casse e Versamenti (L.68/99 art.1)', 'Accountant', 'finance', 'support'],
  ['Addetto al collaudo', 'Operatore di Produzione', 'manufacturing', 'manufacturing'],
  ['Specialista Programmazione Agende', 'Addetto Accettazione', 'healthcare_services', 'support'],
  ['Energy Engineer', 'Process Engineer', 'manufacturing', 'manufacturing'],
  ['Videomaker', 'Marketing Specialist', 'marketing', 'marketing'],
  ['Senior Commercial Manager EMEA, ProCare Services', 'Sales Manager', 'commercial', 'commercial'],
  ['Complaint Quality Approver', 'Quality Assurance Specialist', 'quality', 'regulatory_quality'],
  ['Fellow MSAT Nitrosamine & Impurity Lead', 'CMC Technical Leader', 'rd', 'rd'],
  ['Customer Excellence Lead', 'Training Manager', 'commercial', 'commercial']
];

async function main(){
  console.log(DRY_RUN ? '🔎 DRY RUN\n' : '⚠️  MODALITA\' REALE\n');
  const { data: taxonomy } = await supabase.from('job_taxonomy').select('canonical_role');
  const validRoles = new Set(taxonomy.map(t=>t.canonical_role));
  validRoles.add('Addetto Accettazione'); validRoles.add('Clinical Trial Administrator');
  const { data: existing } = await supabase.from('job_aliases').select('alias');
  const existingLower = new Set(existing.map(a=>a.alias.toLowerCase()));

  for(const [alias, role, area, family] of ALIASES){
    if(!validRoles.has(role)){ console.error(`❌ ruolo inesistente: "${role}"`); continue; }
    if(existingLower.has(alias.toLowerCase())){ console.log(`(gia' esiste) "${alias}"`); continue; }
    console.log(`+ "${alias}" -> ${role}`);
    if(!DRY_RUN){
      const {error} = await supabase.from('job_aliases').insert({alias, canonical_role:role, functional_area:area, role_family:family});
      if(error) console.error('  errore:', error.message);
    }
  }
}
main();
