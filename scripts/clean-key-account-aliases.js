import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Alias rimossi da "Key Account Manager" perche' titoli di ruoli diversi (leadership,
// distribuzione, customer service, marketing/CRM, o troppo generici per assumere
// "key"). I 5 confermati come veri KAM (KAM, kam, Pharmacy Account Manager,
// Account Manager Coronary Therapies, Account Manager – HDS) restano intoccati.
const TO_REMOVE = [
  'Sales Director',
  'Technical Account Manager FCC Catalysts',
  'Sales Partner | Spine (Centro Italia)',
  'Senior CRM and Commercial Excellence',
  'Account Executive Laboratory Solutions (m/f/d) Liguria, Italy',
  'Responsabile Relazione Clienti Tortona (AL)',
  'Responsabile Relazione Clienti Seregno (MB)',
  'Distribution Account Manager – Centro Italia',
  'E-commerce Sales Expert',
  'Account Manager Personal Care (f/m/d)',
  'Commercial Solutions Manager – Ireland',
  'Account Executive Laboratory Solutions - Puglia/Basilicata  (m/f/d) Italy',
  'Account Manager (Lombardia)',
  'Customer Excellence Lead',
  'Account Manager',
  'Consulente Commerciale',
];

async function run() {
  console.log('🧹 PULIZIA ALIAS "Key Account Manager" impropri\n');
  console.log('═'.repeat(80));

  let listingsReset = 0, aliasesDeleted = 0, notFoundAlias = 0;

  for (const alias of TO_REMOVE) {
    const { data: jobs } = await supabase
      .from('job_listings')
      .select('id, job_title')
      .ilike('job_title', alias)
      .eq('canonical_role', 'Key Account Manager');

    if (jobs.length) {
      for (const j of jobs) {
        await supabase.from('job_listings').update({ canonical_role: null }).eq('id', j.id);
        listingsReset++;
      }
      console.log(`   ✅ "${alias}" — resettati ${jobs.length} annunci`);
    } else {
      console.log(`   ⬜ "${alias}" — nessun annuncio corrispondente trovato (verificare match esatto)`);
    }

    const { data: aliasRow, error } = await supabase
      .from('job_aliases')
      .delete()
      .eq('alias', alias)
      .eq('canonical_role', 'Key Account Manager')
      .select('id');
    if (aliasRow && aliasRow.length) aliasesDeleted++;
    else notFoundAlias++;
  }

  console.log(`\n📊 RISULTATO: ${listingsReset} annunci resettati (canonical_role → NULL) | ${aliasesDeleted} alias eliminati | ${notFoundAlias} alias non trovati (controllare)`);

  const { count: finalCount } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).eq('canonical_role', 'Key Account Manager');
  console.log(`\n📊 Annunci rimasti su "Key Account Manager": ${finalCount}`);
  console.log('\n' + '═'.repeat(80));
}
run();
