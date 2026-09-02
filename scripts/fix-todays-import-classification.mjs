// L'import CSV del 01-02/09/2026 (312 annunci, source=Vocations, created_at >=
// 2026-09-02T14:39) ha girato con la versione VECCHIA di importVocationsCSV
// (canonical_role mai impostato, functional_area_v2 dal regex povero) invece
// della versione corretta in index.html — il browser usato per l'import non
// aveva ancora il fix. Questo script applica retroattivamente lo stesso motore
// deterministico (alias/tassonomia, zero IA) che l'import avrebbe dovuto usare.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DRY_RUN = process.argv.includes('--dry-run');
import { classifySeniorityFromText, SENIORITY_ROLE_OVERRIDE } from './lib/seniority-classifier.mjs';

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
    .eq('source','Vocations').gte('created_at','2026-09-02T14:00:00');
  console.log(`Annunci da correggere: ${rows.length}`);

  let roleFixed=0, areaFixed=0, senFixed=0, stillUnmapped=0;
  for(const r of rows){
    const roleInfo = normalizeJobTitle(r.job_title);
    const patch = {};
    if(roleInfo.canonical_role && roleInfo.canonical_role!==r.canonical_role){
      patch.canonical_role = roleInfo.canonical_role;
      patch.role_family = roleInfo.role_family||null;
      roleFixed++;
    }
    if(roleInfo.functional_area && roleInfo.functional_area!==r.functional_area_v2){
      patch.functional_area_v2 = roleInfo.functional_area;
      areaFixed++;
    }
    if(!roleInfo.canonical_role) stillUnmapped++;
    const effectiveRole = patch.canonical_role || r.canonical_role;
    if(effectiveRole){
      const newSen = classifySeniorityFromText(r.job_title, effectiveRole);
      if(newSen && newSen!==r.seniority_v2){ patch.seniority_v2 = newSen; senFixed++; }
    }
    if(Object.keys(patch).length){
      if(!DRY_RUN){
        const {error} = await supabase.from('job_listings').update(patch).eq('id',r.id);
        if(error) console.error(r.job_title,'errore:',error.message);
      }
    }
  }
  console.log(`\ncanonical_role corretti: ${roleFixed}`);
  console.log(`functional_area_v2 corretti: ${areaFixed}`);
  console.log(`seniority_v2 ricalcolati: ${senFixed}`);
  console.log(`Restano senza canonical_role (nessun alias/tassonomia trovato): ${stillUnmapped}`);
}
main();
