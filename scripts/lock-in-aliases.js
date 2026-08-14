import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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
  const { data: taxonomy } = await supabase.from('job_taxonomy').select('canonical_role, role_family, functional_area');
  const taxMap = {};
  taxonomy.forEach(t => { taxMap[t.canonical_role] = t; });

  let inserted = 0, updated = 0;

  for (const [alias, canonical_role] of Object.entries(FIX)) {
    const tax = taxMap[canonical_role] || {};
    const { data: existing } = await supabase.from('job_aliases').select('id').ilike('alias', alias);

    if (existing && existing.length) {
      await supabase.from('job_aliases').update({
        canonical_role, role_family: tax.role_family || null, functional_area: tax.functional_area || null
      }).eq('id', existing[0].id);
      updated++;
    } else {
      await supabase.from('job_aliases').insert({
        alias, canonical_role, role_family: tax.role_family || null, functional_area: tax.functional_area || null
      });
      inserted++;
    }
  }
  console.log(`✅ Alias inseriti: ${inserted} | aggiornati: ${updated}`);
}
run();
