import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { taxonomy, aliases } = JSON.parse(fs.readFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\taxonomy-data.json', 'utf-8'));
const aliasCache = {};
aliases.forEach(a => { aliasCache[a.alias.toLowerCase()] = a; });

function normalizeJobTitle(jobTitle) {
  if (!jobTitle) return { canonical_role: null, role_family: null, functional_area: null };
  const title = jobTitle.trim();
  const titleLower = title.toLowerCase();

  // Override confermato dall'utente: "Engineer" nel titolo -> manufacturing,
  // a meno che non sia esplicitamente IT/Software/R&D/Quality (casi già gestiti
  // correttamente altrove nel titolo con parole chiave più specifiche).
  if (/\bengineer\b/i.test(title) && !/software|it\b|cybersecurity|r&d|research|quality|qa\b|qc\b/i.test(title)) {
    return { canonical_role: null, role_family: 'manufacturing', functional_area: 'manufacturing', matchType: 'override_engineer' };
  }

  if (aliasCache[titleLower]) {
    const a = aliasCache[titleLower];
    return { canonical_role: a.canonical_role, role_family: a.role_family, functional_area: a.functional_area, matchType: 'exact_alias' };
  }

  const aliasEntriesByLength = Object.entries(aliasCache).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, data] of aliasEntriesByLength) {
    if (alias.length < 4) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(title)) {
      return { canonical_role: data.canonical_role, role_family: data.role_family, functional_area: data.functional_area, matchType: 'wordboundary_alias' };
    }
  }

  for (const t of taxonomy) {
    const escaped = t.canonical_role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(title)) {
      return { canonical_role: t.canonical_role, role_family: t.role_family, functional_area: t.functional_area, matchType: 'wordboundary_taxonomy' };
    }
  }

  return { canonical_role: null, role_family: null, functional_area: null, matchType: 'none' };
}

async function run() {
  console.log('🔧 APPLICAZIONE FINALE TASSONOMIA\n');
  console.log('═'.repeat(80));

  // STEP 0: elimina "Chef Di Cucina"
  console.log('\n0️⃣  ELIMINAZIONE "Chef Di Cucina" (Sims)...');
  const { error: delErr } = await supabase.from('job_listings').delete().eq('id', '17951c76-18d2-49bd-8262-39d3b29a2132');
  console.log(delErr ? `   ❌ ${delErr.message}` : '   ✅ Eliminato');

  // STEP 1: annulla la mia classificazione regex precedente sui non-AI-analizzati
  // per rifarla con il dizionario reale
  console.log('\n1️⃣  RESET functional_area_v2 sui non analizzati dall\'AI (prima di riclassificare col dizionario reale)...');
  const { data: unanalyzed } = await supabase
    .from('job_listings')
    .select('id, job_title, functional_area_v2, canonical_role, role_family')
    .is('classification_source', null);
  console.log(`   Trovati: ${unanalyzed.length}`);

  // STEP 2: classifica functional_area_v2 SOLO per i non-AI-analizzati, usando il dizionario
  console.log('\n2️⃣  CLASSIFICAZIONE functional_area_v2 (solo non-AI-analizzati) DA job_taxonomy/job_aliases...');
  let updated = 0, left = 0;
  const matchTypeDist = new Map();
  for (const job of unanalyzed) {
    const resolved = normalizeJobTitle(job.job_title);
    matchTypeDist.set(resolved.matchType, (matchTypeDist.get(resolved.matchType) || 0) + 1);

    const patch = {};
    if (resolved.functional_area !== job.functional_area_v2) patch.functional_area_v2 = resolved.functional_area;
    if (resolved.canonical_role && !job.canonical_role) patch.canonical_role = resolved.canonical_role;
    if (resolved.role_family && !job.role_family) patch.role_family = resolved.role_family;

    if (Object.keys(patch).length > 0) {
      await supabase.from('job_listings').update(patch).eq('id', job.id);
      updated++;
    } else {
      left++;
    }
  }
  console.log(`   ✅ Aggiornati: ${updated} | Invariati: ${left}`);
  console.log('   Tipo di match:', Object.fromEntries(matchTypeDist));

  // STEP 3: riempi canonical_role/role_family mancanti su TUTTI i record
  // (senza toccare functional_area_v2 dei già-AI-classificati)
  console.log('\n3️⃣  RIEMPIMENTO canonical_role/role_family MANCANTI su tutti i record...');
  const { data: missingRole } = await supabase
    .from('job_listings')
    .select('id, job_title, canonical_role, role_family')
    .is('canonical_role', null);
  console.log(`   Trovati senza canonical_role: ${missingRole.length}`);

  let roleFilled = 0;
  for (const job of missingRole) {
    const resolved = normalizeJobTitle(job.job_title);
    if (resolved.canonical_role) {
      await supabase.from('job_listings').update({ canonical_role: resolved.canonical_role, role_family: resolved.role_family }).eq('id', job.id);
      roleFilled++;
    }
  }
  console.log(`   ✅ Riempiti: ${roleFilled}`);

  // STEP 4: stato finale
  console.log('\n4️⃣  STATO FINALE...');
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
