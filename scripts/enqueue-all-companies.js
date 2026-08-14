import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🔧 ENQUEUE TUTTE LE AZIENDE per enrichment\n');
  console.log('═'.repeat(90));

  // 1. Reset dei record "completed" con dati fasulli (bug: fallimento LLM salvato come successo vuoto)
  const { data: fakeCompleted } = await supabase
    .from('enrichment_queue')
    .select('id, company_id')
    .eq('stato', 'completed');

  if (fakeCompleted.length) {
    const { data: companies } = await supabase
      .from('companies')
      .select('id, completezza_arricchimento')
      .in('id', fakeCompleted.map(r => r.company_id));
    const emptyIds = new Set(companies.filter(c => !c.completezza_arricchimento).map(c => c.id));
    const toReset = fakeCompleted.filter(r => emptyIds.has(r.company_id));

    console.log(`\n1️⃣  Record "completed" con dati vuoti (bug storico) da resettare: ${toReset.length}`);
    for (const r of toReset) {
      await supabase.from('enrichment_queue').update({
        stato: 'pending',
        tentativo_numero: 0,
        prossimo_tentativo_il: new Date().toISOString(),
        errore_ultimo: null,
        arricchito_il: null,
      }).eq('id', r.id);
      await supabase.from('companies').update({
        arricchito_il: null,
        completezza_arricchimento: null,
      }).eq('id', r.company_id);
    }
    console.log(`   ✅ ${toReset.length} record resettati a "pending" (verranno ritentati)`);
  }

  // 2. Enqueue di tutte le aziende non ancora in coda
  const { data: allCompanies } = await supabase.from('companies').select('id');
  const { data: queued } = await supabase.from('enrichment_queue').select('company_id');
  const queuedIds = new Set(queued.map(q => q.company_id));
  const missing = allCompanies.filter(c => !queuedIds.has(c.id));

  console.log(`\n2️⃣  Aziende totali: ${allCompanies.length} | già in coda: ${queuedIds.size} | da aggiungere: ${missing.length}`);

  const now = new Date().toISOString();
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH).map(c => ({
      company_id: c.id,
      stato: 'pending',
      priorita: 5,
      tentativo_numero: 0,
      prossimo_tentativo_il: now,
      errore_ultimo: null,
      arricchito_il: null,
    }));
    const { error } = await supabase.from('enrichment_queue').insert(chunk);
    if (error) {
      console.log(`   ⚠️  Errore batch ${i}-${i + chunk.length}: ${error.message}`);
    } else {
      inserted += chunk.length;
      console.log(`   ✅ Inserite ${inserted}/${missing.length}`);
    }
  }

  const { count: finalQueueCount } = await supabase.from('enrichment_queue').select('*', { count: 'exact', head: true });
  const { count: finalPending } = await supabase.from('enrichment_queue').select('*', { count: 'exact', head: true }).eq('stato', 'pending');
  console.log(`\n📊 RISULTATO: coda totale = ${finalQueueCount} | in stato "pending" = ${finalPending}`);
  console.log('\n' + '═'.repeat(90));
}
run();
