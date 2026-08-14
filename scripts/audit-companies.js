import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function auditCompanies() {
  console.log('🔎 AUDIT: TABELLA companies — classificazione e integrità\n');
  console.log('═'.repeat(80));

  try {
    // 1. Overall stats
    const { count: total } = await supabase.from('companies').select('*', { count: 'exact', head: true });
    console.log(`\n1️⃣  Totale aziende: ${total}`);

    // 2. entity_type distribution
    console.log('\n2️⃣  DISTRIBUZIONE entity_type...');
    const { data: allCompanies } = await supabase
      .from('companies')
      .select('id, name, entity_type, dipendenti, website, ragione_sociale, iva, arricchito_il, completezza_arricchimento, aree_terapeutiche, fatturato_range')
      .limit(3000);

    const entityTypes = new Map();
    allCompanies.forEach(c => {
      const v = c.entity_type || 'NULL';
      entityTypes.set(v, (entityTypes.get(v) || 0) + 1);
    });
    entityTypes.forEach((count, type) => console.log(`   "${type}": ${count}`));

    // 3. Companies that were previously enriched (arricchito_il not null)
    console.log('\n3️⃣  AZIENDE GIÀ ARRICCHITE DAL SISTEMA AUTOMATICO (arricchito_il IS NOT NULL)...');
    const enriched = allCompanies.filter(c => c.arricchito_il !== null);
    console.log(`   Trovate: ${enriched.length} aziende con arricchimento pregresso`);
    if (enriched.length > 0) {
      console.log('\n   Dettaglio:');
      enriched.forEach(c => {
        console.log(`   - ${c.name}`);
        console.log(`     arricchito_il: ${c.arricchito_il} | completezza: ${c.completezza_arricchimento}%`);
        console.log(`     dipendenti: ${c.dipendenti} | fatturato: ${c.fatturato_range} | aree_terapeutiche: ${JSON.stringify(c.aree_terapeutiche)}`);
      });
    }

    // 4. Cross-check: companies with enrichment_log entries (proof enrichment agent ran on them)
    console.log('\n4️⃣  AZIENDE CON RECORD IN enrichment_log (prova che l\'agente ha girato su di loro)...');
    const { data: logEntries, error: logErr } = await supabase
      .from('enrichment_log')
      .select('company_id, api_usata, parsing_riuscito, campi_estratti, timestamp')
      .order('timestamp', { ascending: false })
      .limit(100);

    if (logErr) {
      console.log('   ⚠️  Errore:', logErr.message);
    } else {
      console.log(`   Trovati ${logEntries?.length || 0} log di arricchimento (max 100 mostrati)`);
      if (logEntries && logEntries.length > 0) {
        const companyIds = [...new Set(logEntries.map(l => l.company_id))];
        console.log(`   Aziende distinte toccate dall'agente: ${companyIds.length}`);

        // Get names for these
        const { data: namedCompanies } = await supabase
          .from('companies')
          .select('id, name, dipendenti, ragione_sociale, website, iva')
          .in('id', companyIds.slice(0, 30));

        console.log('\n   Stato ATTUALE di queste aziende (dopo il mio import CSV):');
        namedCompanies?.forEach(c => {
          console.log(`   - ${c.name}: dipendenti=${c.dipendenti}, ragione_sociale=${c.ragione_sociale}, website=${c.website}`);
        });
      }
    }

    // 5. Companies with NULL dipendenti/website that appear in enrichment_log (potential wipe)
    console.log('\n5️⃣  VERIFICA WIPE: aziende in enrichment_log ma con campi ora NULL...');
    if (logEntries && logEntries.length > 0) {
      const companyIds = [...new Set(logEntries.map(l => l.company_id))];
      const { data: checkWipe } = await supabase
        .from('companies')
        .select('id, name, dipendenti, website, ragione_sociale')
        .in('id', companyIds);

      const possiblyWiped = checkWipe?.filter(c => !c.dipendenti && !c.website) || [];
      console.log(`   ⚠️  Aziende con log di arricchimento ma dipendenti/website ora NULL: ${possiblyWiped.length}`);
      possiblyWiped.slice(0, 20).forEach(c => console.log(`      - ${c.name}`));
    }

    // 6. Sector/settore field on companies (separate from job_listings functional_area)
    console.log('\n6️⃣  CAMPO SETTORE/SECTOR SU companies (se esiste)...');
    const sample = allCompanies[0];
    console.log('   Campi disponibili su companies:', Object.keys(sample).join(', '));

    console.log('\n' + '═'.repeat(80));
    console.log('\n✅ Audit companies completato\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error(error);
  }
}

auditCompanies();
