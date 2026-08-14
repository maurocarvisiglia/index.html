import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function pct(n, total) { return total ? (100 * n / total).toFixed(1) + '%' : '0%'; }

async function run() {
  console.log('📊 DIAGNOSI ENRICHMENT — tabella companies\n');
  console.log('═'.repeat(90));

  const { data: companies } = await supabase.from('companies').select('*');
  const total = companies.length;
  console.log(`\nTotale aziende: ${total}`);

  // 1. Coda di arricchimento
  console.log('\n1️⃣  STATO enrichment_queue');
  const { data: queue } = await supabase.from('enrichment_queue').select('*');
  const byStato = new Map();
  queue.forEach(q => byStato.set(q.stato, (byStato.get(q.stato) || 0) + 1));
  [...byStato.entries()].forEach(([s, n]) => console.log(`   ${s}: ${n} (${pct(n, queue.length)})`));
  console.log(`   Totale in coda: ${queue.length} / ${total} aziende (${pct(queue.length, total)})`);

  const exhausted = queue.filter(q => q.stato === 'pending' && q.tentativo_numero >= 5);
  console.log(`   ⚠️  Bloccate dopo 5 tentativi (retry esauriti): ${exhausted.length}`);

  const neverQueued = total - queue.length;
  console.log(`   ⚠️  Aziende MAI messe in coda: ${neverQueued} (${pct(neverQueued, total)})`);

  // Errori più comuni
  console.log('\n   Errori più frequenti (errore_ultimo, ultimi tentativi falliti):');
  const errCount = new Map();
  queue.forEach(q => {
    if (!q.errore_ultimo) return;
    const key = q.errore_ultimo.slice(0, 80);
    errCount.set(key, (errCount.get(key) || 0) + 1);
  });
  [...errCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([e, n]) => console.log(`      [${n}x] ${e}`));

  // 2. Copertura campi arricchimento
  console.log('\n2️⃣  COPERTURA CAMPI su companies');
  const fields = ['dipendenti', 'fatturato_range', 'aree_terapeutiche', 'descrizione_aziendale', 'website', 'sector_v2', 'codice_ateco', 'company_type', 'linkedin_url', 'iva'];
  fields.forEach(f => {
    const filled = companies.filter(c => {
      const v = c[f];
      if (Array.isArray(v)) return v.length > 0;
      return v !== null && v !== '';
    }).length;
    console.log(`   ${f.padEnd(24)}: ${filled}/${total} (${pct(filled, total)})`);
  });

  // 3. arricchito_il / completezza
  console.log('\n3️⃣  ARRICCHIMENTO EFFETTIVO (arricchito_il / completezza_arricchimento)');
  const enriched = companies.filter(c => c.arricchito_il !== null);
  console.log(`   Aziende con arricchito_il valorizzato: ${enriched.length}/${total} (${pct(enriched.length, total)})`);
  if (enriched.length) {
    const avgCompl = enriched.reduce((s, c) => s + (c.completezza_arricchimento || 0), 0) / enriched.length;
    console.log(`   Completezza media (solo arricchite): ${avgCompl.toFixed(1)}%`);
    const buckets = { '0%': 0, '1-40%': 0, '41-80%': 0, '81-100%': 0 };
    enriched.forEach(c => {
      const v = c.completezza_arricchimento || 0;
      if (v === 0) buckets['0%']++;
      else if (v <= 40) buckets['1-40%']++;
      else if (v <= 80) buckets['41-80%']++;
      else buckets['81-100%']++;
    });
    Object.entries(buckets).forEach(([b, n]) => console.log(`      ${b}: ${n}`));

    const dates = enriched.map(c => c.arricchito_il).sort();
    console.log(`   Prima esecuzione: ${dates[0]}`);
    console.log(`   Ultima esecuzione: ${dates[dates.length - 1]}`);
  }

  // 4. enrichment_log — attività storica e tasso di successo
  console.log('\n4️⃣  STORICO enrichment_log');
  const { data: logs } = await supabase.from('enrichment_log').select('company_id, api_usata, parsing_riuscito, timestamp').order('timestamp', { ascending: true });
  console.log(`   Totale run loggati: ${logs.length}`);
  if (logs.length) {
    const ok = logs.filter(l => l.parsing_riuscito).length;
    console.log(`   Parsing riuscito: ${ok}/${logs.length} (${pct(ok, logs.length)})`);
    const byApi = new Map();
    logs.forEach(l => byApi.set(l.api_usata || 'n/a', (byApi.get(l.api_usata || 'n/a') || 0) + 1));
    console.log('   Per API/LLM usata:');
    [...byApi.entries()].forEach(([a, n]) => console.log(`      ${a}: ${n}`));

    console.log(`   Primo run: ${logs[0].timestamp}`);
    console.log(`   Ultimo run: ${logs[logs.length - 1].timestamp}`);

    // Attività per giorno (ultimi 14 giorni con dati)
    const byDay = new Map();
    logs.forEach(l => {
      const day = l.timestamp.slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
    });
    const days = [...byDay.entries()].sort();
    console.log(`   Giorni distinti con attività: ${days.length}`);
    console.log('   Ultimi 10 giorni attivi:');
    days.slice(-10).forEach(([d, n]) => console.log(`      ${d}: ${n} aziende processate`));
  }

  // 5. Decision makers / contatti
  console.log('\n5️⃣  CONTATTI ESTRATTI (company_contacts)');
  const { count: contactsCount } = await supabase.from('company_contacts').select('*', { count: 'exact', head: true });
  const companiesWithContacts = new Set((await supabase.from('company_contacts').select('company_id')).data.map(c => c.company_id));
  console.log(`   Totale contatti: ${contactsCount}`);
  console.log(`   Aziende con almeno 1 contatto: ${companiesWithContacts.size}/${total} (${pct(companiesWithContacts.size, total)})`);

  console.log('\n' + '═'.repeat(90));
  console.log('✅ Diagnosi completata');
}
run();
