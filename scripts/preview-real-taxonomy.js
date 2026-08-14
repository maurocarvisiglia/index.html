import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { taxonomy, aliases } = JSON.parse(fs.readFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\taxonomy-data.json', 'utf-8'));

const aliasCache = {};
aliases.forEach(a => { aliasCache[a.alias.toLowerCase()] = a; });

// Stessa logica di normalizeJobTitle() in index.html
function normalizeJobTitle(jobTitle) {
  if (!jobTitle) return { canonical_role: null, role_family: null, functional_area: null };
  const title = jobTitle.trim();
  const titleLower = title.toLowerCase();

  // Step 1: match esatto
  if (aliasCache[titleLower]) {
    const a = aliasCache[titleLower];
    return { canonical_role: a.canonical_role, role_family: a.role_family, functional_area: a.functional_area, matchType: 'exact_alias' };
  }

  // Step 2: word-boundary su alias, ordinati per lunghezza decrescente
  const aliasEntriesByLength = Object.entries(aliasCache).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, data] of aliasEntriesByLength) {
    if (alias.length < 4) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(title)) {
      return { canonical_role: data.canonical_role, role_family: data.role_family, functional_area: data.functional_area, matchType: 'wordboundary_alias' };
    }
  }

  // Step 3: word-boundary su canonical_role della tassonomia
  for (const t of taxonomy) {
    const escaped = t.canonical_role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(title)) {
      return { canonical_role: t.canonical_role, role_family: t.role_family, functional_area: t.functional_area, matchType: 'wordboundary_taxonomy' };
    }
  }

  return { canonical_role: null, role_family: null, functional_area: null, matchType: 'none' };
}

async function preview() {
  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, functional_area_v2, canonical_role')
    .limit(3000);

  console.log(`Totale annunci: ${jobs.length}\n`);

  const results = jobs.map(j => ({ ...j, resolved: normalizeJobTitle(j.job_title) }));

  const matchTypeDist = new Map();
  results.forEach(r => matchTypeDist.set(r.resolved.matchType, (matchTypeDist.get(r.resolved.matchType) || 0) + 1));
  console.log('📊 Tipo di match:');
  matchTypeDist.forEach((c, t) => console.log(`   ${t}: ${c}`));

  const faDist = new Map();
  results.forEach(r => { const v = r.resolved.functional_area || 'NULL'; faDist.set(v, (faDist.get(v) || 0) + 1); });
  console.log('\n📊 Distribuzione functional_area risolta (nuova, da tassonomia):');
  Array.from(faDist.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => console.log(`   ${v.padEnd(22)} ${c} (${((c/results.length)*100).toFixed(1)}%)`));

  // Confronto con il valore attuale che avevo scritto io
  console.log('\n📊 CONFRONTO: quante volte il nuovo valore DIFFERISCE dal mio functional_area_v2 attuale?');
  let same = 0, different = 0, newlyFilled = 0, nowNull = 0;
  results.forEach(r => {
    const old = r.functional_area_v2;
    const neu = r.resolved.functional_area;
    if (old === neu) same++;
    else if (!old && neu) newlyFilled++;
    else if (old && !neu) nowNull++;
    else different++;
  });
  console.log(`   Uguali: ${same}`);
  console.log(`   Nuovi valori (prima NULL, ora classificati): ${newlyFilled}`);
  console.log(`   Ora tornerebbero NULL (prima avevano un valore): ${nowNull}`);
  console.log(`   Diversi (valore cambia): ${different}`);

  console.log('\n📋 Esempi di "diversi" (valore cambia rispetto a quello attuale)...');
  results.filter(r => r.functional_area_v2 && r.resolved.functional_area && r.functional_area_v2 !== r.resolved.functional_area).slice(0, 15).forEach(r => {
    console.log(`   "${r.job_title}" — attuale: ${r.functional_area_v2} → tassonomia: ${r.resolved.functional_area}`);
  });

  console.log('\n📋 Esempi "unmapped" (nessuna corrispondenza, 15 campioni)...');
  const unmapped = results.filter(r => r.resolved.matchType === 'none');
  console.log(`Totale unmapped: ${unmapped.length}`);
  unmapped.slice(0, 15).forEach(r => console.log(`   "${r.job_title}"`));
}

preview();
