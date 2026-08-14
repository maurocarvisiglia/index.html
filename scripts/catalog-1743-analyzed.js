import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Fonte: campo "functional_area" reale, prodotto dalla pipeline AI (groq_v2)
// sui 1743 annunci con ai_analyzed=true. Nessuna invenzione: solo mappatura
// diretta nome→codice ufficiale della tabella functional_areas.
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
  // NON mappati (ambigui): altro, Healthcare, Marketing and Sales,
  // Safety and Security, Life Sciences, Salute e Assistenza → restano NULL
};

async function catalogAnalyzed() {
  console.log('🔧 CATALOGAZIONE functional_area_v2 — SOLO i 1743 già analizzati (groq_v2)\n');
  console.log('═'.repeat(80));

  try {
    console.log('\n1️⃣  CARICAMENTO ANNUNCI CON classification_source = groq_v2...');
    const { data: jobs, error } = await supabase
      .from('job_listings')
      .select('id, functional_area, job_title, company_name')
      .eq('classification_source', 'groq_v2');

    if (error) throw error;
    console.log(`   ✅ Trovati ${jobs.length} annunci già analizzati dalla pipeline AI`);

    console.log('\n2️⃣  CALCOLO functional_area_v2...');
    let mapped = 0, ambiguous = 0, noFunctionalArea = 0;
    const updates = jobs.map(job => {
      let newValue = null;
      if (job.functional_area && primaryMap[job.functional_area]) {
        newValue = primaryMap[job.functional_area];
        mapped++;
      } else if (job.functional_area) {
        ambiguous++; // es. "altro" — resta NULL
      } else {
        noFunctionalArea++; // analizzato ma senza functional_area — resta NULL
      }
      return { id: job.id, newValue };
    });

    console.log(`   Mappati su codice ufficiale: ${mapped}`);
    console.log(`   Ambigui (es. "altro"), resta NULL: ${ambiguous}`);
    console.log(`   Analizzati ma senza functional_area, resta NULL: ${noFunctionalArea}`);

    console.log('\n3️⃣  SCRITTURA SU SUPABASE...');
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

    console.log('\n4️⃣  DISTRIBUZIONE FINALE (solo sui 1743 analizzati)...');
    const { data: finalCheck } = await supabase
      .from('job_listings')
      .select('functional_area_v2')
      .eq('classification_source', 'groq_v2');

    const dist = new Map();
    finalCheck.forEach(j => {
      const v = j.functional_area_v2 || 'NULL';
      dist.set(v, (dist.get(v) || 0) + 1);
    });
    Array.from(dist.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => {
      const pct = ((c/finalCheck.length)*100).toFixed(1);
      console.log(`   ${v.padEnd(22)} ${c} (${pct}%)`);
    });

    console.log('\n5️⃣  STATO GLOBALE job_listings.functional_area_v2 (inclusi i 587 non toccati)...');
    const { count: totalJobs } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
    const { count: withFA } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('functional_area_v2', 'is', null);
    console.log(`   Totale annunci: ${totalJobs}`);
    console.log(`   Con functional_area_v2: ${withFA} (${((withFA/totalJobs)*100).toFixed(1)}%)`);
    console.log(`   NULL (ambigui o non ancora analizzati dalla pipeline AI): ${totalJobs - withFA}`);

    console.log('\n' + '═'.repeat(80));
    console.log('\n✨ Fatto — solo dati reali della pipeline AI, nessuna invenzione.\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error);
  }
}

catalogAnalyzed();
