import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('🔎 Verifica tabella unmapped_job_titles...\n');
  const { count, error } = await supabase.from('unmapped_job_titles').select('*', { count: 'exact', head: true });
  if (error) { console.log('❌ Tabella non trovata o inaccessibile:', error.message); return; }
  console.log(`Righe attuali: ${count}`);

  const { data: jobs } = await supabase
    .from('job_listings')
    .select('job_title, company_name')
    .is('canonical_role', null);

  console.log(`\nTitoli senza canonical_role da registrare: ${jobs.length}`);

  // Raggruppa per titolo normalizzato (come fa logUnmappedTitle nell'app)
  const grouped = new Map();
  jobs.forEach(j => {
    const norm = (j.job_title || '').trim().toLowerCase();
    if (!norm) return;
    if (!grouped.has(norm)) grouped.set(norm, { job_title: j.job_title, sample_company: j.company_name, occurrences: 0 });
    grouped.get(norm).occurrences++;
  });

  console.log(`Titoli distinti (normalizzati): ${grouped.size}`);

  let inserted = 0, updated = 0;
  for (const [norm, data] of grouped) {
    const { data: existing } = await supabase
      .from('unmapped_job_titles')
      .select('id, occurrences')
      .eq('job_title_normalized', norm);

    if (existing && existing.length) {
      await supabase.from('unmapped_job_titles').update({
        occurrences: existing[0].occurrences + data.occurrences,
        last_seen: new Date().toISOString()
      }).eq('id', existing[0].id);
      updated++;
    } else {
      await supabase.from('unmapped_job_titles').insert({
        job_title: data.job_title,
        job_title_normalized: norm,
        sample_company: data.sample_company,
        occurrences: data.occurrences
      });
      inserted++;
    }
  }

  console.log(`\n✅ Inseriti: ${inserted} | Aggiornati: ${updated}`);
}

run();
