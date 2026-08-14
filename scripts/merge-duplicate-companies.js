import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function normalize(name) {
  if (!name) return '';
  let n = name.toLowerCase();
  n = n.replace(/\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|s\.?t\.?p\.?|ltd|inc|italia|italy|s\.?u\.?|società|per azioni|a responsabilità limitata|unipersonale|in breve.*|o .*società.*)\b/gi, '');
  n = n.replace(/[.,'’\-–—()]/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

// Rimuove suffissi legali per ottenere un nome "brand" pulito da usare come display name
function cleanBrandName(name) {
  if (!name) return name;
  let n = name.replace(/\s*\b(S\.?p\.?A\.?|S\.?r\.?l\.?|S\.?a\.?s\.?|S\.?n\.?c\.?|S\.?t\.?p\.?|Ltd|Inc)\.?\s*$/i, '').trim();
  return n || name;
}

const MERGEABLE_FIELDS = ['sector_v2','website','linkedin_url','indeed_url','glassdoor_url','iva','province','region','collar','orario','categorie_protette','posizioni_aperte','dipendenti','codice_ateco','company_type','activity_description','research_raw_text','fatturato_range','aree_terapeutiche','descrizione_aziendale','arricchito_il','completezza_arricchimento','sectors','research_notes','last_researched_at','last_updated_vocations'];

async function run() {
  console.log('🔧 MERGE DUPLICATI companies\n');
  console.log('═'.repeat(90));

  const { data: companies } = await supabase.from('companies').select('*');
  const byNorm = new Map();
  companies.forEach(c => {
    const key = normalize(c.name);
    if (!key || key.length < 3) return;
    if (!byNorm.has(key)) byNorm.set(key, []);
    byNorm.get(key).push(c);
  });
  const groups = [...byNorm.entries()].filter(([,arr]) => arr.length > 1);

  const { data: jobCounts } = await supabase.from('job_listings').select('id, company_id');
  const jobsByCompany = new Map();
  jobCounts.forEach(j => { if (j.company_id) { if (!jobsByCompany.has(j.company_id)) jobsByCompany.set(j.company_id, []); jobsByCompany.get(j.company_id).push(j.id); } });

  const { data: eq } = await supabase.from('enrichment_queue').select('id, company_id');
  const eqByCompany = new Map(); eq.forEach(r => eqByCompany.set(r.company_id, r.id));

  let merged = 0, skippedConflict = 0, totalJobsReassigned = 0;
  const conflicts = [];

  for (const [key, group] of groups) {
    // Conflitto: piu' di una ragione_sociale NON NULLA diversa nel gruppo -> non indovino
    const ragioniSociali = new Set(group.map(c => (c.ragione_sociale||'').trim().toUpperCase()).filter(Boolean));
    if (ragioniSociali.size > 1) {
      skippedConflict++;
      conflicts.push({ key, group, reason: 'ragione_sociale in conflitto: ' + [...ragioniSociali].join(' | ') });
      continue;
    }

    // Vincitore: quello con piu' annunci collegati; a parita', quello con piu' campi compilati
    const withJobCount = group.map(c => ({ c, jobs: jobsByCompany.get(c.id)?.length || 0, filled: Object.values(c).filter(v => v !== null && v !== '' && !(Array.isArray(v)&&v.length===0)).length }));
    withJobCount.sort((a,b) => b.jobs - a.jobs || b.filled - a.filled);
    const winner = withJobCount[0].c;
    const losers = withJobCount.slice(1).map(x => x.c);

    // Merge campi: coalesce, il winner vince se ha gia' un valore
    const patch = {};
    for (const field of MERGEABLE_FIELDS) {
      if (winner[field] === null || winner[field] === undefined || winner[field] === '') {
        const donor = losers.find(l => l[field] !== null && l[field] !== undefined && l[field] !== '');
        if (donor) patch[field] = donor[field];
      }
    }
    // ragione_sociale: garantita corretta (unica non-null nel gruppo, se esiste)
    if (!winner.ragione_sociale && ragioniSociali.size === 1) patch.ragione_sociale = [...ragioniSociali][0];
    // name: usa la versione brand pulita piu' leggibile tra tutte quelle nel gruppo
    const nameCandidates = group.map(c => c.name).filter(Boolean);
    const cleaned = nameCandidates.map(cleanBrandName);
    // preferisci la piu' corta tra le pulite (di solito la forma brand, non quella con forma legale)
    const bestName = cleaned.sort((a,b) => a.length - b.length)[0];
    if (bestName && bestName !== winner.name) patch.name = bestName;

    if (Object.keys(patch).length) {
      await supabase.from('companies').update(patch).eq('id', winner.id);
    }

    // Riassegna job_listings dai perdenti al vincitore
    for (const loser of losers) {
      const jobIds = jobsByCompany.get(loser.id) || [];
      if (jobIds.length) {
        await supabase.from('job_listings').update({ company_id: winner.id }).eq('company_id', loser.id);
        totalJobsReassigned += jobIds.length;
      }
      // enrichment_queue ha UNIQUE(company_id): se il loser ne ha uno e il winner pure, elimina quello del loser
      const loserEq = eqByCompany.get(loser.id);
      if (loserEq) {
        if (eqByCompany.get(winner.id)) {
          await supabase.from('enrichment_queue').delete().eq('id', loserEq);
        } else {
          await supabase.from('enrichment_queue').update({ company_id: winner.id }).eq('id', loserEq);
        }
      }
      // enrichment_log e company_contacts: nessun vincolo UNIQUE, riassegna liberamente
      await supabase.from('enrichment_log').update({ company_id: winner.id }).eq('company_id', loser.id);
      await supabase.from('company_contacts').update({ company_id: winner.id }).eq('company_id', loser.id);
    }

    // Elimina i record perdenti
    for (const loser of losers) {
      await supabase.from('companies').delete().eq('id', loser.id);
    }

    merged++;
    console.log(`✅ [${key}] → "${patch.name || winner.name}" (ragione_sociale: ${patch.ragione_sociale || winner.ragione_sociale || '—'}) — ${losers.length} duplicato/i eliminato/i, ${losers.reduce((s,l)=>s+(jobsByCompany.get(l.id)?.length||0),0)} annunci riassegnati`);
  }

  console.log(`\n📊 RISULTATO: ${merged} gruppi consolidati | ${skippedConflict} saltati per conflitto ragione_sociale | ${totalJobsReassigned} annunci riassegnati totali`);

  if (conflicts.length) {
    console.log('\n⚠️  GRUPPI SALTATI (conflitto ragione_sociale, serve revisione manuale):');
    conflicts.forEach(c => {
      console.log(`\n   Chiave: "${c.key}" — ${c.reason}`);
      c.group.forEach(g => console.log(`      - "${g.name}" (ragione_sociale: ${g.ragione_sociale || '—'}, id: ${g.id})`));
    });
  }

  const { count: finalCount } = await supabase.from('companies').select('*', { count: 'exact', head: true });
  console.log(`\n📊 Aziende totali dopo il merge: ${finalCount}`);
  console.log('\n' + '═'.repeat(90));
}
run();
