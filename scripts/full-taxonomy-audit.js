import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fullTaxonomyAudit() {
  console.log('🔎 AUDIT COMPLETO TASSONOMIA RUOLI E AREE\n');
  console.log('═'.repeat(80));

  try {
    // 1. Check constraints on job_listings columns (authoritative source of valid values)
    console.log('\n1️⃣  VINCOLI CHECK SU job_listings (fonte autorevole valori validi)...');
    let constraints = null;
    try {
      const res = await supabase.rpc('exec_sql', {
        sql: `
          SELECT conname, pg_get_constraintdef(oid) as definition
          FROM pg_constraint
          WHERE conrelid = 'job_listings'::regclass
          AND contype = 'c'
        `
      });
      constraints = res.data;
      if (res.error) throw res.error;
    } catch (e) {
      console.log('   ⚠️  RPC exec_sql non disponibile su questo progetto (normale, non tutti i progetti Supabase la espongono).');
    }

    if (constraints) {
      constraints.forEach(c => {
        console.log(`\n   ${c.conname}:`);
        console.log(`   ${c.definition}`);
      });
    }

    // 2. List all tables to find taxonomy/glossary tables
    console.log('\n2️⃣  RICERCA TABELLE DI TASSONOMIA/GLOSSARIO...');
    const tablesToCheck = [
      'therapeutic_areas_glossary',
      'functional_areas_glossary',
      'functional_areas',
      'role_taxonomy',
      'seniority_glossary',
      'job_categories',
      'sectors_glossary',
      'taxonomy',
      'glossario_ruoli',
      'aree_funzionali'
    ];

    for (const table of tablesToCheck) {
      const { data, error } = await supabase.from(table).select('*').limit(50);
      if (!error && data) {
        console.log(`\n   ✅ TROVATA: "${table}" (${data.length} righe)`);
        console.log('   ' + JSON.stringify(data.slice(0, 5), null, 2).split('\n').join('\n   '));
      }
    }

    // 3. Current distinct values in job_listings for each taxonomy field
    console.log('\n3️⃣  VALORI ATTUALI DISTINTI IN job_listings...');
    const { data: jobs, error: jobsErr } = await supabase
      .from('job_listings')
      .select('functional_area_v2, therapeutic_area, seniority_v2')
      .limit(5000);

    if (jobsErr) {
      console.log('   ❌ Errore query job_listings:', jobsErr.message);
      return;
    }

    ['functional_area_v2', 'therapeutic_area', 'seniority_v2'].forEach(field => {
      const values = new Map();
      jobs.forEach(j => {
        const v = j[field] === null ? 'NULL' : j[field];
        values.set(v, (values.get(v) || 0) + 1);
      });
      console.log(`\n   📊 ${field} (${values.size} valori distinti):`);
      Array.from(values.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([v, c]) => console.log(`      "${v}": ${c}`));
    });

    // 4. Check therapeutic_areas_glossary in detail (already know structure)
    console.log('\n4️⃣  GLOSSARIO AREE TERAPEUTICHE UFFICIALE...');
    const { data: glossary } = await supabase
      .from('therapeutic_areas_glossary')
      .select('*')
      .order('codice');

    console.log(`   ${glossary?.length || 0} codici ufficiali:`);
    glossary?.forEach(g => console.log(`   ${g.codice.padEnd(15)} = ${g.nome_it} (${g.nome_en})`));

    // 5. Cross-check: how many current therapeutic_area values match glossary
    console.log('\n5️⃣  CONFRONTO: therapeutic_area ATTUALE vs GLOSSARIO...');
    const glossaryCodes = new Set(glossary?.map(g => g.codice) || []);
    let matching = 0, notMatching = 0;
    jobs.forEach(j => {
      if (j.therapeutic_area && glossaryCodes.has(j.therapeutic_area)) matching++;
      else if (j.therapeutic_area) notMatching++;
    });
    console.log(`   ✅ Corrispondenti al glossario: ${matching}`);
    console.log(`   ❌ NON corrispondenti (valori inventati): ${notMatching}`);

    console.log('\n' + '═'.repeat(80));
    console.log('\n✅ Audit completato\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error);
  }
}

fullTaxonomyAudit();
