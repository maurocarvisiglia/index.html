import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const titles = [
  "Direttore/Direttrice di Farmacia",
  "Ottico/a abilitato",
  "Detailer",
  "Senior Regional Sales Manager, Trauma (North Italy)",
  "Informatore Specialist M/F",
  "Project Engineer",
  "Regional Sales Manager, Extremities (Northern & Central Italy)",
  "Field Service Engineer",
  "Clinical Sales Specialist North-East Italy - Vascular",
  "Technology Sales Representative (Emilia Romagna)",
  "Clinical Pathology Research Associate",
  "External Manufacturing Manager",
  "Technology Transfer Engineer",
  "Third Party Manufactory Junior",
  "I&C Technician",
  "Maintenance & Engineering Coordinator",
  "OPEX Expert",
  "Global Supply Chain Planning Specialist",
  "Direttore/Direttrice a Porto Ercole (Grosseto)",
  "Anatomic Pathology Technician",
  "Managing Director"
];

async function run() {
  for (const title of titles) {
    const { data: jobs } = await supabase
      .from('job_listings')
      .select('job_title, company_name, canonical_role, job_description, classified_at')
      .eq('job_title', title)
      .order('classified_at', { ascending: true });

    console.log('\n' + '='.repeat(90));
    console.log(`"${title}" — ${jobs.length} record`);
    console.log('='.repeat(90));
    jobs.forEach(j => {
      console.log(`\n[${j.canonical_role}] — ${j.company_name} — classified_at: ${j.classified_at}`);
      console.log((j.job_description || 'NESSUNA DESCRIZIONE').substring(0, 350));
    });
  }
}
run();
