import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getEntityTypes() {
  console.log('🔍 Checking entity_type values in database...\n');

  try {
    const { data, error } = await supabase
      .from('companies')
      .select('entity_type')
      .neq('entity_type', null)
      .limit(1000);

    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }

    const types = new Map();
    data.forEach(row => {
      const type = row.entity_type;
      types.set(type, (types.get(type) || 0) + 1);
    });

    console.log('📊 Unique entity_type values:');
    types.forEach((count, type) => {
      console.log(`   - "${type}": ${count} companies`);
    });

    console.log('\n✅ Use one of these values for new companies!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

getEntityTypes();
