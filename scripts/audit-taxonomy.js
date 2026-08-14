import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function auditTaxonomy() {
  console.log('🔎 AUDIT: TASSONOMIA RUOLI DOPO IMPORT\n');
  console.log('═'.repeat(80));

  try {
    // 1. Check therapeutic_areas_glossary (official taxonomy)
    console.log('\n1️⃣  GLOSSARIO UFFICIALE AREE TERAPEUTICHE (therapeutic_areas_glossary)...');
    const { data: glossary, error: glossaryError } = await supabase
      .from('therapeutic_areas_glossary')
      .select('*');

    if (glossaryError) {
      console.log(`   ❌ Tabella non accessibile: ${glossaryError.message}`);
    } else {
      console.log(`   ✅ ${glossary.length} codici ufficiali:`);
      glossary.forEach(g => console.log(`      ${g.codice} = ${g.nome_it}`));
    }

    // 2. Check what values are ACTUALLY in job_listings.therapeutic_area
    console.log('\n2️⃣  VALORI REALI IN job_listings.therapeutic_area...');
    const { data: jobs } = await supabase
      .from('job_listings')
      .select('therapeutic_area, functional_area_v2, company_name, created_at')
      .limit(5000);

    const areaValues = new Map();
    jobs.forEach(j => {
      const v = j.therapeutic_area || 'NULL';
      areaValues.set(v, (areaValues.get(v) || 0) + 1);
    });

    console.log(`   Valori distinti trovati: ${areaValues.size}`);
    Array.from(areaValues.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => {
      const inGlossary = glossary?.some(g => g.codice.toLowerCase() === v.toLowerCase());
      console.log(`   ${inGlossary ? '✅' : '❌'} "${v}": ${c} annunci ${inGlossary ? '' : '← NON nel glossario ufficiale!'}`);
    });

    // 3. Check the suspicious oncology spike from the last script
    console.log('\n3️⃣  VERIFICA SPIKE SOSPETTO "oncology" (68.7%)...');
    const { data: oncologyJobs } = await supabase
      .from('job_listings')
      .select('id, company_name, functional_area_v2, therapeutic_area')
      .eq('therapeutic_area', 'oncology')
      .limit(20);

    console.log(`   Esempio di 20 annunci taggati "oncology":`);
    const companiesInOncology = new Set();
    oncologyJobs?.forEach(j => companiesInOncology.add(j.company_name));
    console.log(`   Aziende diverse: ${companiesInOncology.size}`);
    Array.from(companiesInOncology).slice(0, 15).forEach(c => console.log(`      - ${c}`));

    // 4. Check functional_area_v2 values against expected taxonomy from frontend
    console.log('\n4️⃣  VALORI functional_area_v2 vs TASSONOMIA FRONTEND...');
    const expectedAreas = ['medical_affairs','commercial','marketing','market_access','regulatory_affairs',
      'quality','clinical_operations','drug_safety','rd','manufacturing','supply_chain','finance','hr','it','business_development'];

    const sectorValues = new Map();
    jobs.forEach(j => {
      const v = j.functional_area_v2 || 'NULL';
      sectorValues.set(v, (sectorValues.get(v) || 0) + 1);
    });

    console.log(`   Valori distinti: ${sectorValues.size}`);
    Array.from(sectorValues.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => {
      const isExpected = expectedAreas.includes(v);
      console.log(`   ${isExpected ? '✅' : '❌'} "${v}": ${c} annunci ${isExpected ? '' : '← NON è un valore atteso dal frontend (qb-area)!'}`);
    });

    // 5. Check jobs imported in last session (created recently) for issues
    console.log('\n5️⃣  QUALITÀ DATI IMPORT RECENTE (ultimi 2 giorni)...');
    const twoDaysAgo = new Date(Date.now() - 2*864e5).toISOString();
    const { data: recentJobs, count: recentCount } = await supabase
      .from('job_listings')
      .select('id, company_name, therapeutic_area, functional_area_v2, published_date', { count: 'exact' })
      .gte('created_at', twoDaysAgo)
      .limit(5000);

    console.log(`   Record creati/modificati di recente: ${recentCount}`);

    console.log('\n' + '═'.repeat(80));
    console.log('\n📋 CONCLUSIONI:\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

auditTaxonomy();
