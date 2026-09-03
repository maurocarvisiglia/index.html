import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Bug: 2 alias mappano "Operatore/Operatrice di Produzione" a "Manutentore" invece
// di "Operatore di Produzione" — ha contaminato il report per la figura Manutentore
// con operatori di produzione reali (Sentiamo, Bozzetto Group). Segnalato da Mauro
// il 03/09/2026 mentre analizzava un report Service Engineer/manutentori.
const BAD_ALIASES = ['Operatore/Operatrice di Produzione', 'Operatore/Operatrice di Produzione (m/f/x)'];

async function main() {
  console.log('1) Correggo gli alias in job_aliases...');
  for (const alias of BAD_ALIASES) {
    const { data, error } = await supabase.from('job_aliases')
      .update({ canonical_role: 'Operatore di Produzione' })
      .eq('alias', alias)
      .eq('canonical_role', 'Manutentore')
      .select();
    if (error) { console.error(`  ❌ ${alias}:`, error.message); continue; }
    console.log(`  ✅ "${alias}" -> Operatore di Produzione (${data.length} riga aggiornata)`);
  }

  console.log('\n2) Correggo i job_listings già classificati male...');
  const { data: bad } = await supabase.from('job_listings')
    .select('id,job_title,canonical_role,company_name')
    .eq('canonical_role', 'Manutentore')
    .or(BAD_ALIASES.map(a => `job_title.eq.${a}`).join(','));

  console.log(`  Trovati ${bad?.length || 0} annunci da correggere:`);
  for (const l of bad || []) {
    const { error } = await supabase.from('job_listings')
      .update({ canonical_role: 'Operatore di Produzione' })
      .eq('id', l.id);
    if (error) { console.error(`  ❌ "${l.job_title}" (${l.company_name}):`, error.message); continue; }
    console.log(`  ✅ "${l.job_title}" (${l.company_name}) -> Operatore di Produzione`);
  }
}
main();
