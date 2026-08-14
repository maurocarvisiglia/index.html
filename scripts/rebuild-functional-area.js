import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Fonte primaria: campo "functional_area" (classificazione automatica pre-esistente,
// mai toccata dai miei script precedenti — classification_source: groq_v2).
const primaryMap = {
  'Sales': 'commercial',
  'Produzione': 'manufacturing',
  'Quality Assurance': 'quality',
  'IT': 'it',
  'Supply Chain': 'supply_chain',
  'Finance': 'finance',
  'Clinical Operations': 'clinical_operations',
  'R&D': 'rd',
  'Business Development': 'business_development',
  'Medical Affairs': 'medical_affairs',
  'HR': 'hr',
  'Regulatory Affairs': 'regulatory_affairs',
  'Marketing': 'marketing',
  'Market Access': 'market_access',
  'Pharmacovigilance': 'drug_safety'
  // NON mappati (troppo ambigui, restano NULL): altro, Healthcare,
  // Marketing and Sales, Safety and Security, Life Sciences, Salute e Assistenza
};

// Fallback secondario: solo per record con functional_area NULL, e solo dove
// role_family ha corrispondenza diretta/univoca (esclusi "support" e
// "regulatory_quality" perché usati come bucket generico per più aree diverse).
const fallbackMap = {
  'medical_affairs': 'medical_affairs',
  'clinical_operations': 'clinical_operations',
  'market_access': 'market_access',
  'scientific_rd': 'rd',
  'marketing': 'marketing',
  'manufacturing': 'manufacturing',
  'commercial': 'commercial',
  'business_development': 'business_development',
  'it': 'it',
  'general_management': 'general_management'
};

async function rebuildFunctionalArea() {
  console.log('🔧 RICOSTRUZIONE functional_area_v2\n');
  console.log('═'.repeat(80));

  try {
    console.log('\n1️⃣  CARICAMENTO ANNUNCI...');
    const { data: jobs, error } = await supabase
      .from('job_listings')
      .select('id, functional_area, role_family')
      .limit(3000);

    if (error) throw error;
    console.log(`   ✅ ${jobs.length} annunci caricati`);

    console.log('\n2️⃣  CALCOLO NUOVO VALORE PER OGNI ANNUNCIO...');
    let fromPrimary = 0, fromFallback = 0, leftNull = 0;
    const updates = jobs.map(job => {
      let newValue = null;
      let source = 'none';

      if (job.functional_area && primaryMap[job.functional_area]) {
        newValue = primaryMap[job.functional_area];
        source = 'primary';
      } else if (!job.functional_area && job.role_family && fallbackMap[job.role_family]) {
        newValue = fallbackMap[job.role_family];
        source = 'fallback';
      }

      if (source === 'primary') fromPrimary++;
      else if (source === 'fallback') fromFallback++;
      else leftNull++;

      return { id: job.id, newValue };
    });

    console.log(`   Da mappatura primaria (functional_area): ${fromPrimary}`);
    console.log(`   Da fallback (role_family): ${fromFallback}`);
    console.log(`   Restano NULL (nessun segnale affidabile): ${leftNull}`);

    console.log('\n3️⃣  SCRITTURA SU SUPABASE (sovrascrivo tutti i valori corrotti)...');
    let done = 0;
    for (const u of updates) {
      const { error: updErr } = await supabase
        .from('job_listings')
        .update({ functional_area_v2: u.newValue })
        .eq('id', u.id);

      if (updErr) {
        console.log(`   ❌ Errore su ${u.id}: ${updErr.message}`);
      } else {
        done++;
        if (done % 300 === 0) process.stdout.write(`\r   Progresso: ${done}/${updates.length}`);
      }
    }
    console.log(`\r   ✅ Completato: ${done}/${updates.length}`);

    console.log('\n4️⃣  VERIFICA DISTRIBUZIONE FINALE...');
    const { data: finalCheck } = await supabase
      .from('job_listings')
      .select('functional_area_v2')
      .limit(3000);

    const dist = new Map();
    finalCheck.forEach(j => {
      const v = j.functional_area_v2 || 'NULL';
      dist.set(v, (dist.get(v) || 0) + 1);
    });

    Array.from(dist.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => {
      const pct = ((c/finalCheck.length)*100).toFixed(1);
      console.log(`   ${v.padEnd(22)} ${c} (${pct}%)`);
    });

    console.log('\n' + '═'.repeat(80));
    console.log('\n✨ Ricostruzione functional_area_v2 completata — nessun valore inventato.\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error);
  }
}

rebuildFunctionalArea();
