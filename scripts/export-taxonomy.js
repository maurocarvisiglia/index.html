import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function exportTaxonomy() {
  const { data: taxonomy } = await supabase.from('job_taxonomy').select('*');
  const { data: aliases } = await supabase.from('job_aliases').select('*');

  fs.writeFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\taxonomy-data.json', JSON.stringify({ taxonomy, aliases }, null, 2));

  console.log(`job_taxonomy: ${taxonomy.length} righe`);
  console.log(`job_aliases: ${aliases.length} righe`);

  // distinct functional_area values across both tables
  const faValues = new Set();
  taxonomy.forEach(t => faValues.add(t.functional_area));
  aliases.forEach(a => faValues.add(a.functional_area));
  console.log('\nValori distinti functional_area nella tassonomia:');
  console.log([...faValues].sort().join(', '));

  const rfValues = new Set();
  taxonomy.forEach(t => rfValues.add(t.role_family));
  aliases.forEach(a => rfValues.add(a.role_family));
  console.log('\nValori distinti role_family nella tassonomia:');
  console.log([...rfValues].sort().join(', '));
}

exportTaxonomy();
