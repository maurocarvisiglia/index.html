// Fonde le aziende duplicate individuate nella diagnosi (stessa Partita IVA o
// stesso dominio del sito web, ma record separati). Non cancella mai righe:
// sposta i riferimenti (job_listings, company_facts, company_therapeutic_areas,
// enrichment_log, company_contacts) sul record canonico, poi marca il duplicato
// con merged_into + is_active=false. Reversibile: nessuna riga viene persa.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DRY_RUN = process.argv.includes('--dry-run');

// Gruppi legati solo dal sito web condiviso ma che, guardando i nomi, sono
// verosimilmente business unit/entita' storiche DISTINTE di un grande gruppo
// (non un doppione di battitura) - qui la fusione perderebbe una distinzione
// reale. Esclusi dalla fusione automatica, segnalati a parte per revisione manuale.
const ESCLUDI_NOMI = [
  'ROCHE DIABETES CARE ITALY S.P.A.', 'Roche Diagnostics S.p.A.', 'Roche Pharma S.p.A.', 'Roche',
  'IQVIA', 'IQVIA RDS ITALY S.r.l.', 'IQVIA Solutions Italy S.r.l.',
  'BAXTER MANUFACTURING S.P.A.', 'BIEFFE MEDITAL S.P.A.', 'GAMBRO DASCO S.P.A.',
  'DIALIFLUIDS S.R.L.', 'FRESENIUS ITALIA SPA', "SIS-TER SPA (FRESENIUS MEDICAL CARE)",
];

function normalizeWebsite(w) {
  if (!w) return null;
  return w.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').toLowerCase();
}

async function main() {
  console.log(DRY_RUN ? '🔎 DRY RUN — nessuna scrittura verrà eseguita\n' : '⚠️  MODALITA\' REALE — verranno scritte modifiche\n');

  const { data: companies } = await supabase.from('companies').select('*').is('merged_into', null);
  console.log('Aziende attive analizzate:', companies.length);

  const { data: listings } = await supabase.from('job_listings').select('id, company_id');
  const listingCountByCompany = {};
  listings.forEach(l => { if (l.company_id) listingCountByCompany[l.company_id] = (listingCountByCompany[l.company_id] || 0) + 1; });

  // Raggruppa per IVA e per dominio sito — un'azienda puo' comparire in entrambi
  // i tipi di gruppo, quindi uniamo i gruppi che condividono almeno un id (union-find semplice).
  const groupsByKey = {};
  companies.forEach(c => {
    if (c.iva) { const k = 'iva:' + c.iva.trim(); (groupsByKey[k] = groupsByKey[k] || []).push(c); }
    if (c.website) { const k = 'web:' + normalizeWebsite(c.website); (groupsByKey[k] = groupsByKey[k] || []).push(c); }
  });

  // Union-find per fondere gruppi che condividono aziende (es. stessa IVA E stesso sito)
  const parent = {};
  function find(x) { while (parent[x] && parent[x] !== x) x = parent[x]; return x; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
  companies.forEach(c => { parent[c.id] = c.id; });
  Object.values(groupsByKey).forEach(group => {
    if (group.length < 2) return;
    for (let i = 1; i < group.length; i++) union(group[0].id, group[i].id);
  });

  const finalGroups = {};
  companies.forEach(c => {
    const root = find(c.id);
    (finalGroups[root] = finalGroups[root] || []).push(c);
  });
  const allDupGroups = Object.values(finalGroups).filter(g => g.length > 1);
  const dupGroups = allDupGroups.filter(g => !g.some(c => ESCLUDI_NOMI.includes(c.name)));
  const excludedGroups = allDupGroups.filter(g => g.some(c => ESCLUDI_NOMI.includes(c.name)));
  console.log('Gruppi di duplicati trovati (uniti per IVA/sito condivisi):', allDupGroups.length);
  console.log('Esclusi per revisione manuale (verosimili business unit distinte):', excludedGroups.length);
  excludedGroups.forEach(g => console.log('   ⚠️ ', g.map(c => c.name).join(' | ')));
  console.log('Gruppi da fondere ora:', dupGroups.length);
  console.log('Record azienda coinvolti:', dupGroups.reduce((a, g) => a + g.length, 0));

  let totalListingsMoved = 0, totalFactsMoved = 0, totalAreasMoved = 0, totalLogsMoved = 0, totalContactsMoved = 0;
  let totalFactsSkipped = 0, totalAreasSkipped = 0;

  for (const group of dupGroups) {
    // Canonico: piu' annunci collegati: a parita', piu' campi compilati; a parita', il piu' vecchio (created_at).
    const scored = group.map(c => ({
      c,
      listings: listingCountByCompany[c.id] || 0,
      filledFields: Object.values(c).filter(v => v !== null && v !== '').length,
    })).sort((a, b) => b.listings - a.listings || b.filledFields - a.filledFields || new Date(a.c.created_at) - new Date(b.c.created_at));
    const canonical = scored[0].c;
    const duplicates = scored.slice(1).map(s => s.c);

    console.log(`\n── ${canonical.name} (canonico, id ${canonical.id}, ${scored[0].listings} annunci) ──`);
    for (const dup of duplicates) {
      const dupListings = listingCountByCompany[dup.id] || 0;
      console.log(`   fondo: "${dup.name}" (id ${dup.id}, ${dupListings} annunci) ->`);

      if (!DRY_RUN) {
        // 1. job_listings
        const { data: movedListings } = await supabase.from('job_listings').update({ company_id: canonical.id }).eq('company_id', dup.id).select('id');
        totalListingsMoved += movedListings?.length || 0;

        // 2. company_facts — puo' collidere sul vincolo (company_id,tipo,valore_norm): se il
        // canonico ha gia' lo stesso fatto, saltiamo la riga duplicata invece di far fallire tutto.
        const { data: dupFacts } = await supabase.from('company_facts').select('*').eq('company_id', dup.id);
        for (const f of (dupFacts || [])) {
          const { error } = await supabase.from('company_facts').update({ company_id: canonical.id }).eq('id', f.id);
          if (error) totalFactsSkipped++; else totalFactsMoved++;
        }

        // 3. company_therapeutic_areas — stesso discorso sul vincolo (company_id,code,fonte).
        const { data: dupAreas } = await supabase.from('company_therapeutic_areas').select('*').eq('company_id', dup.id);
        for (const a of (dupAreas || [])) {
          const { error } = await supabase.from('company_therapeutic_areas').update({ company_id: canonical.id }).eq('id', a.id);
          if (error) totalAreasSkipped++; else totalAreasMoved++;
        }

        // 4. enrichment_log — nessun vincolo di unicita', spostamento diretto.
        const { data: movedLogs } = await supabase.from('enrichment_log').update({ company_id: canonical.id }).eq('company_id', dup.id).select('id');
        totalLogsMoved += movedLogs?.length || 0;

        // 5. company_contacts
        const { data: movedContacts } = await supabase.from('company_contacts').update({ company_id: canonical.id }).eq('company_id', dup.id).select('id');
        totalContactsMoved += movedContacts?.length || 0;

        // 6. Riempie sul canonico i campi vuoti usando i dati del duplicato (mai sovrascrive).
        const patch = {};
        for (const [k, v] of Object.entries(dup)) {
          if (['id', 'name', 'created_at', 'merged_into'].includes(k)) continue;
          if ((canonical[k] === null || canonical[k] === '') && v !== null && v !== '') patch[k] = v;
        }
        if (Object.keys(patch).length) {
          await supabase.from('companies').update(patch).eq('id', canonical.id);
          Object.assign(canonical, patch);
        }

        // 7. Marca il duplicato come fuso.
        await supabase.from('companies').update({ merged_into: canonical.id, is_active: false }).eq('id', dup.id);
      }
    }
  }

  console.log('\n════════════════════════════════════════');
  console.log('RISULTATO', DRY_RUN ? '(simulato)' : '');
  console.log('Gruppi fusi:', dupGroups.length);
  console.log('Annunci spostati:', totalListingsMoved);
  console.log('Fatti CORE spostati:', totalFactsMoved, '| scartati per duplicato gia\' presente sul canonico:', totalFactsSkipped);
  console.log('Aree terapeutiche spostate:', totalAreasMoved, '| scartate per duplicato gia\' presente:', totalAreasSkipped);
  console.log('Log arricchimento spostati:', totalLogsMoved);
  console.log('Contatti spostati:', totalContactsMoved);
}
main();
