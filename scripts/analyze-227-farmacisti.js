import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function analyze() {
  console.log('🔎 ANALISI DEI 227 "FARMACISTA" NON CLASSIFICATI\n');
  console.log('═'.repeat(80));

  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name, functional_area, functional_area_v2, canonical_role, sub_area, job_description')
    .ilike('job_title', '%farmacist%')
    .is('functional_area_v2', null);

  console.log(`\nTotale record: ${jobs.length}\n`);

  // Group by title pattern
  const patterns = {
    'Direttore/Direttrice': [],
    'Collaboratore/trice': [],
    'con alloggio': [],
    'categorie protette': [],
    'generico (solo "Farmacista")': [],
    'altro pattern': []
  };

  jobs.forEach(j => {
    const t = j.job_title || '';
    if (/direttore|direttrice/i.test(t)) patterns['Direttore/Direttrice'].push(j);
    else if (/collaboratore|collaboratrice/i.test(t)) patterns['Collaboratore/trice'].push(j);
    else if (/con alloggio/i.test(t)) patterns['con alloggio'].push(j);
    else if (/categorie protette/i.test(t)) patterns['categorie protette'].push(j);
    else if (/^farmacista\s*$/i.test(t.trim()) || /^farmacista a /i.test(t)) patterns['generico (solo "Farmacista")'].push(j);
    else patterns['altro pattern'].push(j);
  });

  Object.entries(patterns).forEach(([label, items]) => {
    console.log(`\n--- ${label}: ${items.length} record ---`);
    items.slice(0, 5).forEach(i => console.log(`   "${i.job_title}" — ${i.company_name}`));
  });

  console.log('\n\n📋 TUTTI I TITOLI DISTINTI DI "altro pattern" (per capire se serve una categoria in più)...');
  const distinctOther = [...new Set(patterns['altro pattern'].map(j => j.job_title))];
  distinctOther.forEach(t => console.log(`   "${t}"`));

  console.log('\n\n📋 CAMPIONE job_description per capire se "Direttore/Direttrice" ha contenuto gestionale reale...');
  patterns['Direttore/Direttrice'].slice(0, 3).forEach(j => {
    console.log(`\n"${j.job_title}" — ${j.company_name}`);
    console.log((j.job_description || '').substring(0, 400));
  });
}

analyze();
