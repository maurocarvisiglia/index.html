/**
 * MERGE MIRATO · 7 duplicati trovati durante il matching AIFA (05/09/2026)
 * =============================================================================
 * A differenza di merge-duplicate-companies.js (che scansiona l'intera
 * tabella con una normalizzazione piu' leggera), questi 7 casi sono stati
 * trovati con la normalizzazione piu' aggressiva usata per abbinare i
 * titolari AIC — e verificati uno per uno prima di fondere (vedi
 * conversazione: Menarini/Menarini Biotech NON sono un duplicato, siti e
 * settori diversi, restano separate).
 *
 * Vincitore = piu' annunci collegati, a parita' ragione_sociale compilata.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MERGEABLE_FIELDS = ['sector_v2','website','linkedin_url','indeed_url','iva','province','region','collar','orario','categorie_protette','posizioni_aperte','dipendenti','codice_ateco','company_type','activity_description','research_raw_text','fatturato_range','aree_terapeutiche','descrizione_aziendale','arricchito_il','completezza_arricchimento','sectors','research_notes','last_researched_at','last_updated_vocations'];

const COPPIE = [
  { vincitore: 'e3d1cee1-7193-4ee4-9f90-7572a48362a3', perdente: 'bbcda9c1-5fc3-4559-bc2d-20a25eed9229', label: 'Roche' },
  { vincitore: 'daf0393b-acbe-4604-9b63-b98cdf634574', perdente: '8c202fe7-d81d-411b-9628-c8d60be4705a', label: 'Alexion' },
  { vincitore: 'debc8148-5584-4b0c-92b8-5fc3c4836418', perdente: '32353930-0ed6-40f9-8028-e183aa460b7e', label: 'Incyte' },
  { vincitore: 'cf6601c8-33c1-4295-b919-2eeaf5b01503', perdente: '0c79c78e-d248-4bbb-8d3d-ec528f2fab8d', label: 'Sintesy' },
  { vincitore: 'fd17b65b-3177-4ce6-b820-fa55148a4e72', perdente: 'a8a88145-6ba8-4d94-9efd-e0cf89e9e9ac', label: 'Ever' },
  { vincitore: '755e1865-1d32-4613-8820-c38daaedd75c', perdente: 'c77582bf-5104-41a1-b9e3-0588f6c35bf5', label: 'Lama' },
  { vincitore: 'd34c50ce-fa1d-4aab-bc38-66f6a82de849', perdente: '65602cc7-19c2-4abc-9fec-bf8b7e7a7f13', label: 'Synlab' },
];

async function run() {
  console.log('🔧 MERGE MIRATO — 7 duplicati AIFA\n' + '═'.repeat(80));

  for (const { vincitore, perdente, label } of COPPIE) {
    const { data: rows } = await supabase.from('companies').select('*').in('id', [vincitore, perdente]);
    const win = rows.find(r => r.id === vincitore);
    const lose = rows.find(r => r.id === perdente);
    if (!win || !lose) { console.log(`❌ ${label}: id non trovato (già fuso?)`); continue; }

    const patch = {};
    for (const field of MERGEABLE_FIELDS) {
      if (win[field] === null || win[field] === undefined || win[field] === '') {
        if (lose[field] !== null && lose[field] !== undefined && lose[field] !== '') patch[field] = lose[field];
      }
    }
    if (!win.ragione_sociale && lose.ragione_sociale) patch.ragione_sociale = lose.ragione_sociale;
    if (Object.keys(patch).length) await supabase.from('companies').update(patch).eq('id', win.id);

    const { data: jobs } = await supabase.from('job_listings').select('id').eq('company_id', lose.id);
    if (jobs.length) await supabase.from('job_listings').update({ company_id: win.id }).eq('company_id', lose.id);

    const { data: loserEq } = await supabase.from('enrichment_queue').select('id').eq('company_id', lose.id).maybeSingle();
    if (loserEq) {
      const { data: winEq } = await supabase.from('enrichment_queue').select('id').eq('company_id', win.id).maybeSingle();
      if (winEq) await supabase.from('enrichment_queue').delete().eq('id', loserEq.id);
      else await supabase.from('enrichment_queue').update({ company_id: win.id }).eq('id', loserEq.id);
    }
    await supabase.from('enrichment_log').update({ company_id: win.id }).eq('company_id', lose.id);
    await supabase.from('company_contacts').update({ company_id: win.id }).eq('company_id', lose.id);
    await supabase.from('company_products').update({ company_id: win.id }).eq('company_id', lose.id);
    await supabase.from('company_therapeutic_areas').update({ company_id: win.id }).eq('company_id', lose.id);
    await supabase.from('company_facts').update({ company_id: win.id }).eq('company_id', lose.id);

    // Il perdente resta in tabella come storico (merged_into), non viene eliminato:
    // stessa cautela gia' in uso altrove nel progetto per companies fuse.
    await supabase.from('companies').update({ merged_into: win.id, is_active: false }).eq('id', lose.id);

    console.log(`✅ ${label}: "${lose.name}" -> "${win.name}" (${jobs.length} annunci riassegnati)`);
  }

  console.log('\n' + '═'.repeat(80) + '\nFatto.');
}
run();
