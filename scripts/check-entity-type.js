import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkEntityType() {
  try {
    // Query the database for entity_type constraint
    const { data, error } = await supabase.rpc('', {
      query: `
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'companies'
      `
    }).catch(() => null);

    // Try direct query approach
    const { data: sample } = await supabase
      .from('companies')
      .select('entity_type')
      .limit(10);

    console.log('Sample company entity_types:');
    if (sample) {
      const types = new Set(sample.map(c => c.entity_type).filter(Boolean));
      console.log('Unique values:', Array.from(types));
    }

    // Get the column info
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/?apikey=${process.env.SUPABASE_SERVICE_ROLE_KEY}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.pgrst.object+json'
      }
    }).catch(() => null);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkEntityType();
