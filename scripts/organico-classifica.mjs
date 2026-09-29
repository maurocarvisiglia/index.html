/**
 * ORGANICO · RICLASSIFICAZIONE DALL'ARCHIVIO (28/09/2026)
 * =============================================================================
 *   node scripts/organico-classifica.mjs                 misura: copertura + titoli non mappati
 *   node scripts/organico-classifica.mjs --apply         ricostruisce company_workforce
 *   node scripts/organico-classifica.mjs --company=<id>  una sola azienda
 *
 * company_workforce e' un DERIVATO di apollo_people_raw: per ogni azienda con
 * scarico completo si cancellano le righe e si riscrivono con le regole di
 * scripts/lib/organico-tassonomia.mjs. Zero chiamate Apollo: migliorare le
 * regole e rilanciare questo script basta a riclassificare tutto.
 *
 * Le aziende senza archivio (es. le 278 dell'import manuale iniziale) non
 * vengono toccate finche' il loro scarico non e' completo.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { rigaWorkforce } from './lib/organico-tassonomia.mjs';
import { risolviDominiCondivisi, togliOrganicoNonTitolari } from './lib/apollo-domini.mjs';
import { membriDiGruppo, ricostruisciGruppi } from './lib/apollo-gruppi.mjs';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
const SOLO = (process.argv.find((a) => a.startsWith('--company=')) || '').slice(10) || null;

async function leggiTutte(nome, query, pagina = 1000) {
  const righe = [];
  for (let da = 0; ; da += pagina) {
    const { data, error } = await query().range(da, da + pagina - 1);
    if (error) throw new Error(`lettura ${nome} fallita: ${error.message}`);
    righe.push(...(data || []));
    if (!data || data.length < pagina) return righe;
  }
}

async function main() {
  console.log(`\nOrganico · riclassificazione dall'archivio  ${APPLY ? 'SCRIVE' : 'solo misura'}${SOLO ? ` · azienda ${SOLO}` : ''}\n`);

  const settori = new Map((await leggiTutte('companies', () => supabase.from('companies').select('id,sector_v2').order('id'))).map((c) => [c.id, c.sector_v2]));
  let qScarico = () => supabase.from('apollo_people_scarico').select('company_id').eq('completo', true).order('company_id');
  if (SOLO) qScarico = () => supabase.from('apollo_people_scarico').select('company_id').eq('completo', true).eq('company_id', SOLO).order('company_id');
  const tutteComplete = (await leggiTutte('apollo_people_scarico', qScarico)).map((r) => r.company_id);

  // Domini condivisi: un solo titolare per dominio, ricalcolato dall'ultimo
  // scarico (vedi scripts/lib/apollo-domini.mjs). Le schede non titolari non
  // ricevono l'organico: sarebbe la copia di quello del titolare.
  // Gruppi con capogruppo (scripts/lib/apollo-gruppi.mjs): i loro membri escono
  // da questa regola, le persone le distribuisce il gruppo alla fine.
  const { membri } = await membriDiGruppo(supabase);
  const { righe: domini, nonTitolari } = await risolviDominiCondivisi(supabase, { scrivi: APPLY, membri });
  const complete = tutteComplete.filter((id) => !nonTitolari.has(id) && !membri.has(id));
  console.log(`aziende con scarico completo: ${tutteComplete.length} · domini condivisi ${domini.length} (${domini.filter((d) => !d.company_id).length} senza titolare) · schede escluse ${tutteComplete.length - complete.length} (non titolari o membri di ${new Set([...membri.values()].map((m) => m.gruppoId)).size} gruppi con capogruppo)`);

  let persone = 0, classificate = 0, scritte = 0, errori = 0;
  const nonMappati = new Map();
  for (let i = 0; i < complete.length; i += 50) {
    const lotto = complete.slice(i, i + 50);
    const archivio = await leggiTutte('apollo_people_raw', () => supabase.from('apollo_people_raw')
      .select('company_id,apollo_person_id,title').in('company_id', lotto).order('company_id').order('apollo_person_id'));
    const perAzienda = new Map(lotto.map((id) => [id, []]));
    for (const p of archivio) {
      persone++;
      const riga = rigaWorkforce(p.company_id, p, settori.get(p.company_id));
      if (riga) { classificate++; perAzienda.get(p.company_id).push(riga); continue; }
      const t = (p.title || '(senza titolo)').trim().toLowerCase();
      nonMappati.set(t, (nonMappati.get(t) || 0) + 1);
    }
    if (!APPLY) continue;
    for (const [companyId, righe] of perAzienda) {
      const { error: eDel } = await supabase.from('company_workforce').delete().eq('company_id', companyId);
      if (eDel) { errori++; console.error(`  ${companyId}: cancellazione fallita: ${eDel.message}`); continue; }
      for (let j = 0; j < righe.length; j += 500) {
        const { error } = await supabase.from('company_workforce').insert(righe.slice(j, j + 500));
        if (error) { errori++; console.error(`  ${companyId}: scrittura fallita: ${error.message}`); break; }
        scritte += Math.min(500, righe.length - j);
      }
    }
    if ((i / 50) % 10 === 0) console.log(`  ${Math.min(i + 50, complete.length)}/${complete.length} aziende`);
  }

  const pct = persone ? (100 * classificate / persone).toFixed(1) : '0';
  console.log(`\npersone ${persone} · classificate ${classificate} (${pct}%) · non mappate ${persone - classificate} · titoli distinti non mappati ${nonMappati.size}`);
  if (APPLY) {
    const daTogliere = [...nonTitolari].filter((id) => !membri.has(id));
    if (!SOLO) console.log(`organico tolto a ${await togliOrganicoNonTitolari(supabase, daTogliere)} schede non titolari`);
    else if (daTogliere.includes(SOLO)) await togliOrganicoNonTitolari(supabase, [SOLO]);
    if (!SOLO) {
      const gr = await ricostruisciGruppi(supabase, { scrivi: true });
      console.log(`gruppi con capogruppo: ${gr.gruppi} · persone attribuite ${gr.righe}`);
    }
    console.log(`righe scritte in company_workforce: ${scritte} · errori: ${errori}`);
    const { error } = await supabase.rpc('apollo_rinfresca_riepiloghi');
    console.log(error ? `riepiloghi front-end NON rinfrescati: ${error.message}` : 'riepiloghi front-end rinfrescati');
  }
  console.log('\nprimi 30 titoli non mappati (elenco completo: vista v_organico_titoli_non_mappati):');
  [...nonMappati.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([t, n]) => console.log(String(n).padStart(7), ' ', t.slice(0, 80)));
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
