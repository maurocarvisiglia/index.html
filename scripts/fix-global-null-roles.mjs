// Riclassifica TUTTI gli annunci con canonical_role NULL in tutto il database
// (non solo l'ultimo import), usando il dizionario alias/tassonomia ORA
// completo (HR, catch-all, lotto CSV 01-02/09/2026, Account Manager...).
// Molte righe storiche non erano mai state riprese dai fix di oggi perche'
// quei fix erano scoped al solo import piu' recente.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DRY_RUN = process.argv.includes('--dry-run');
import { classifySeniorityFromText } from './lib/seniority-classifier.mjs';

const { data: taxonomy } = await supabase.from('job_taxonomy').select('*');
const { data: aliasRows } = await supabase.from('job_aliases').select('*');
const aliasCache = {};
aliasRows.forEach(a=>{ aliasCache[a.alias.toLowerCase()] = a; });
function normalizeJobTitle(jobTitle){
  const title = jobTitle.trim();
  const titleLower = title.toLowerCase();
  if(aliasCache[titleLower]){
    const a = aliasCache[titleLower];
    return { canonical_role: a.canonical_role, role_family: a.role_family, functional_area: a.functional_area };
  }
  const exactTax = taxonomy.find(t=>t.canonical_role.toLowerCase()===titleLower);
  if(exactTax) return { canonical_role: exactTax.canonical_role, role_family: exactTax.role_family, functional_area: exactTax.functional_area };
  const candidates = [
    ...Object.entries(aliasCache).map(([alias,data])=>({text:alias,minLen:4,canonical_role:data.canonical_role,role_family:data.role_family,functional_area:data.functional_area})),
    ...taxonomy.map(t=>({text:t.canonical_role,minLen:1,canonical_role:t.canonical_role,role_family:t.role_family,functional_area:t.functional_area}))
  ].sort((a,b)=>b.text.length-a.text.length);
  for(const c of candidates){
    if(c.text.length<c.minLen) continue;
    const escaped=c.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const regex=new RegExp(`\\b${escaped}\\b`,'i');
    if(regex.test(title)) return { canonical_role: c.canonical_role, role_family: c.role_family, functional_area: c.functional_area };
  }
  return { canonical_role: null, role_family: null, functional_area: null };
}

async function main(){
  console.log(DRY_RUN ? '🔎 DRY RUN\n' : '⚠️  MODALITA\' REALE\n');
  const { data: rows } = await supabase.from('job_listings')
    .select('id,job_title,canonical_role,role_family,functional_area_v2,seniority_v2')
    .is('canonical_role', null);
  console.log(`Annunci con canonical_role NULL: ${rows.length}`);

  let fixed=0, stillNull=0;
  for(const r of rows){
    const roleInfo = normalizeJobTitle(r.job_title);
    if(!roleInfo.canonical_role){ stillNull++; continue; }
    const patch = { canonical_role: roleInfo.canonical_role, role_family: roleInfo.role_family||null };
    if(roleInfo.functional_area && roleInfo.functional_area!==r.functional_area_v2) patch.functional_area_v2 = roleInfo.functional_area;
    const newSen = classifySeniorityFromText(r.job_title, roleInfo.canonical_role);
    if(newSen && newSen!==r.seniority_v2) patch.seniority_v2 = newSen;
    console.log(`"${r.job_title}" -> ${roleInfo.canonical_role}`);
    fixed++;
    if(!DRY_RUN){
      const {error} = await supabase.from('job_listings').update(patch).eq('id',r.id);
      if(error) console.error('  errore:',error.message);
    }
  }
  console.log(`\nCorretti: ${fixed} | Restano senza ruolo: ${stillNull}`);
}
main();
