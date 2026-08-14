import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Titolo esatto -> canonical_role corretto (verificato dal contenuto reale delle descrizioni)
const FIX = {
  "Direttore/Direttrice di Farmacia": "Farmacista Direttore",
  "Ottico/a abilitato": "Ottico/Optometrista",
  "Detailer": "Medical Representative",
  "Senior Regional Sales Manager, Trauma (North Italy)": "Field Sales Manager",
  "Informatore Specialist M/F": "Informatore Scientifico del Farmaco",
  "Project Engineer": "Process Engineer",
  "Regional Sales Manager, Extremities (Northern & Central Italy)": "Area Manager Commercial",
  "Field Service Engineer": "Field Service Engineer",
  "Clinical Sales Specialist North-East Italy - Vascular": "Clinical Sales Specialist",
  "Technology Sales Representative (Emilia Romagna)": "Sales Specialist",
  "Clinical Pathology Research Associate": "Research Associate",
  "External Manufacturing Manager": "Supply Chain Manager",
  "Technology Transfer Engineer": "Process Engineer",
  "Third Party Manufactory Junior": "Supply Chain Manager",
  "I&C Technician": "Process Engineer",
  "Maintenance & Engineering Coordinator": "Process Engineer",
  "OPEX Expert": "Process Engineer",
  "Global Supply Chain Planning Specialist": "Supply Planner",
  "Direttore/Direttrice a Porto Ercole (Grosseto)": "Farmacista Direttore",
  "Anatomic Pathology Technician": "Tecnico di Laboratorio",
  "Managing Director": "Managing Director"
};

async function run() {
  console.log('🔧 CORREZIONE 21 GRUPPI INCOERENTI (verificati dal contenuto)\n');
  console.log('═'.repeat(90));

  // Carica job_taxonomy per recuperare role_family/functional_area corretti per ogni canonical_role target
  const { data: taxonomy } = await supabase.from('job_taxonomy').select('canonical_role, role_family, functional_area');
  const taxMap = {};
  taxonomy.forEach(t => { taxMap[t.canonical_role] = t; });

  let totalUpdated = 0;

  for (const [title, targetRole] of Object.entries(FIX)) {
    const { data: jobs } = await supabase
      .from('job_listings')
      .select('id, canonical_role, role_family, functional_area_v2')
      .eq('job_title', title);

    const tax = taxMap[targetRole];
    let groupUpdated = 0;

    for (const j of jobs) {
      const needsFix = j.canonical_role !== targetRole;
      if (!needsFix) continue;

      const patch = { canonical_role: targetRole };
      if (tax) {
        patch.role_family = tax.role_family;
        // functional_area_v2: aggiorna solo se il valore attuale non è già valido/coerente
        // (non tocchiamo se già settato da AI su descrizione reale, a meno che sia palesemente diverso)
        if (tax.functional_area) patch.functional_area_v2 = tax.functional_area;
      }

      await supabase.from('job_listings').update(patch).eq('id', j.id);
      groupUpdated++;
    }

    if (groupUpdated > 0) {
      console.log(`✅ "${title}" → ${targetRole} (${groupUpdated} record aggiornati)`);
      totalUpdated += groupUpdated;
    } else {
      console.log(`⚪ "${title}" → già tutti coerenti`);
    }
  }

  console.log(`\n📊 Totale record aggiornati: ${totalUpdated}`);

  // Verifica finale: nessun gruppo tra questi 21 titoli dovrebbe più avere canonical_role incoerente
  console.log('\n🔎 VERIFICA FINALE...');
  let stillInconsistent = 0;
  for (const title of Object.keys(FIX)) {
    const { data: jobs } = await supabase.from('job_listings').select('canonical_role').eq('job_title', title);
    const values = new Set(jobs.map(j => j.canonical_role));
    if (values.size > 1) {
      console.log(`   ⚠️  ANCORA INCOERENTE: "${title}" → ${[...values].join(', ')}`);
      stillInconsistent++;
    }
  }
  console.log(stillInconsistent === 0 ? '   ✅ Tutti i 21 gruppi sono ora coerenti.' : `   ❌ ${stillInconsistent} gruppi ancora da rivedere.`);

  console.log('\n' + '═'.repeat(90));
}
run();
