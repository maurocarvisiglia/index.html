import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testMarketSignals() {
  console.log('🧪 TESTING MARKET SIGNALS DATA QUERY\n');
  console.log('═'.repeat(70));

  try {
    // Query esatta come nel frontend
    console.log('\n1️⃣  LOADING DATA AS FRONTEND WOULD...');
    const { data, error } = await supabase
      .from('job_listings')
      .select('*')
      .order('published_date', { ascending: false, nullsFirst: false })
      .limit(3000);

    if (error) {
      console.error('❌ ERROR:', error.message);
      return;
    }

    console.log(`   ✅ Loaded ${data.length} job listings`);

    // Check fields
    console.log('\n2️⃣  CHECKING REQUIRED FIELDS...');
    if (data.length > 0) {
      const sample = data[0];
      const requiredFields = [
        'id', 'company_id', 'published_date', 'company_name',
        'ragione_sociale', 'functional_area_v2', 'therapeutic_area',
        'seniority_v2'
      ];

      console.log('\n   Sample job:');
      requiredFields.forEach(field => {
        const value = sample[field];
        const status = value ? '✅' : '❌';
        console.log(`   ${status} ${field}: ${value ? JSON.stringify(value).substring(0, 50) : 'MISSING'}`);
      });
    }

    // Sample of company_names
    console.log('\n3️⃣  SAMPLE OF COMPANY NAMES...');
    const companies = new Set(data.map(l => l.company_name).filter(Boolean));
    console.log(`   Total unique companies: ${companies.size}`);
    Array.from(companies).slice(0, 10).forEach(c => {
      console.log(`   - ${c}`);
    });

    // Jobs published in last 30 days
    console.log('\n4️⃣  JOBS BY PUBLICATION DATE...');
    const now = new Date().getTime();
    const ms30 = 30 * 864e5;
    const last30 = data.filter(l => l.published_date && new Date(l.published_date).getTime() > now - ms30);
    console.log(`   Last 30 days: ${last30.length}`);

    // Check for market signals
    console.log('\n5️⃣  TESTING SIGNAL DETECTION...');
    const byCompany = {};
    data.forEach(l => {
      const c = l.ragione_sociale || l.company_name;
      if (!c) return;
      if (!byCompany[c]) byCompany[c] = [];
      byCompany[c].push(l);
    });

    console.log(`   Companies with jobs: ${Object.keys(byCompany).length}`);

    let expansionSignals = 0;
    Object.entries(byCompany).forEach(([company, listings]) => {
      const d30 = listings.filter(l =>
        l.published_date && new Date(l.published_date).getTime() > now - ms30
      );
      const salesRoles = d30.filter(l => l.functional_area_v2 === 'commercial').length;
      if (salesRoles >= 2) {
        expansionSignals++;
        console.log(`   🚀 ${company}: ${salesRoles} commercial roles`);
      }
    });

    console.log('\n   Potential expansion signals: ' + expansionSignals);

    console.log('\n' + '═'.repeat(70));
    console.log('\n✅ Test complete!\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

testMarketSignals();
