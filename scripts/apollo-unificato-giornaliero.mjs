/**
 * APOLLO · RACCOLTA UNIFICATA GIORNALIERA · una sola visita per azienda
 * =============================================================================
 *   node scripts/apollo-unificato-giornaliero.mjs               misura (12 aziende)
 *   node scripts/apollo-unificato-giornaliero.mjs --apply       scrive
 *   node scripts/apollo-unificato-giornaliero.mjs --apply --n=8 quantita' diversa
 *
 * SOSTITUISCE tre script che il 23/09/2026 giravano separati sulle STESSE
 * aziende, ognuno con la propria ricerca Apollo — richiesto esplicitamente da
 * Mauro ("un'unica chiamata per tutte le informazioni, non piu' chiamate
 * diverse"): apollo-enrichment-agent.js (dati azienda), organico-automatico-
 * giornaliero.mjs (organico per funzione), apollo-decision-makers.mjs
 * (decision maker + email). Per ogni azienda, UNA sola visita fa tutto:
 *
 *   1. organizations/enrich(dominio) — descrizione, LinkedIn, crescita,
 *      industry, organico per reparto (aggregato, senza nomi)
 *   2. mixed_people/api_search(dominio) in paginazione — l'UNICA ricerca
 *      persone, usata per DUE scopi insieme (non due ricerche separate):
 *        a. classificazione organico per funzione (company_workforce)
 *        b. individuazione del decision maker (titoli HR/TA, poi C-level
 *           di ripiego) DENTRO la stessa lista gia' scaricata
 *      Il conteggio Italia (companies.dipendenti) viene da qui (total_entries
 *      dichiarato da Apollo), non da una terza chiamata dedicata come prima.
 *   3. people/match(id) — UNA sola rivelazione email, solo per il decision
 *      maker gia' individuato al punto 2b, mai una ricerca a parte.
 *
 * COSTO: i punti 1 e 3 consumano crediti del piano (scoperto il 23/09/2026:
 * anche organizations/enrich, non solo people/match); il punto 2 e' solo
 * ricerca, gratuito, limitato solo dalla frequenza Apollo. Se i crediti sono
 * esauriti, i punti 1 e 3 falliscono ma il punto 2 (il piu' voluminoso: fino a
 * 1.500 persone per azienda) prosegue comunque — non si perde mai il lavoro
 * gratuito per un errore sul lavoro a pagamento.
 *
 * REGISTRO — dal 28/09/2026 il gate e' apollo_people_scarico (stato dello
 * scarico persone per azienda, ripristinabile), non piu' company_workforce:
 * un'azienda con zero titoli riconosciuti non ha righe in company_workforce e
 * veniva ritentata o, peggio, data per fatta. Vedi il blocco ARCHIVIO sotto.
 * L'arricchimento dati
 * azienda si ritenta naturalmente finche' i suoi campi restano NULL (stesso
 * principio gia' in uso in apollo-enrichment-agent.js). Il decision maker usa
 * il registro company_facts_lookup_log(tipo='decision_maker_apollo') — stesso
 * usato da apollo-decision-makers.mjs, cosi' le aziende gia' tentate da quello
 * script il 23/09 non vengono ririsollevate qui.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { creaArchivio } from './lib/apollo-archivio.mjs';
import { rigaWorkforce } from './lib/organico-tassonomia.mjs';
import { risolviDominiCondivisi, togliOrganicoNonTitolari } from './lib/apollo-domini.mjs';
import { membriDiGruppo, ricostruisciGruppi } from './lib/apollo-gruppi.mjs';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APOLLO_KEY = process.env.APOLLO_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const DM_REGISTRO_TIPO = 'decision_maker_apollo';
const TIME_BUDGET_MS = 45000;

const argN = (process.argv.find((a) => a.startsWith('--n=')) || '').slice(4);
const N_OGGI = Number(process.env.APOLLO_UNIFICATO_DAILY_LIMIT || argN || 12);
const APPLY = process.argv.includes('--apply');

function normalize(name) {
  if (!name) return '';
  let n = name.toLowerCase();
  n = n.replace(/\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|s\.?t\.?p\.?|ltd|inc|italia|italy|s\.?u\.?|società|per azioni|a responsabilità limitata|unipersonale)\b/gi, '');
  n = n.replace(/[.,'’\-–—()|]/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}
function isPlausibleMatch(companyName, apolloName) {
  const a = normalize(companyName).split(' ').filter((t) => t.length > 2);
  const b = normalize(apolloName).split(' ').filter((t) => t.length > 2);
  if (a.length && b.length) {
    const setB = new Set(b);
    const overlap = a.filter((t) => setB.has(t)).length;
    if (overlap >= 1 && overlap / Math.min(a.length, b.length) >= 0.4) return true;
  }
  const squashA = normalize(companyName).replace(/\s+/g, '');
  const squashB = normalize(apolloName).replace(/\s+/g, '');
  if (squashA.length >= 2 && squashB.length >= 2) {
    if (squashB.startsWith(squashA) || squashA.startsWith(squashB)) return true;
  }
  return false;
}
function extractDomain(website) {
  if (!website) return null;
  try {
    const url = website.match(/^https?:\/\//) ? website : 'https://' + website;
    return new URL(url).hostname.replace(/^www\./, '') || null;
  } catch { return null; }
}
function revenueToRange(revenue) {
  if (revenue == null) return null;
  if (revenue < 5e6) return '<5M';
  if (revenue < 20e6) return '5-20M';
  if (revenue < 100e6) return '20-100M';
  if (revenue < 250e6) return '100-250M';
  if (revenue < 500e6) return '250-500M';
  return '>500M';
}
async function translateDescriptionToItalian(text) {
  if (!GEMINI_KEY || !text) return text;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: `Traduci in italiano corrente questo testo aziendale, senza aggiungere o omettere informazioni. Rispondi SOLO con la traduzione, niente altro.\n\nTESTO:\n"""${text}"""` }] }] }),
    });
    const d = await res.json();
    return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;
  } catch { return text; }
}


// ─────────────────────────────────────────────────────────────────────────────
// ARCHIVIO (28/09/2026) — ogni chiamata Apollo passa da scripts/lib/apollo-
// archivio.mjs, che conserva la risposta intera e aggiorna l'inventario dei
// campi. La classificazione viene da scripts/lib/organico-tassonomia.mjs
// (prima era copiata qui e in organico-automatico-giornaliero.mjs).
//
// Cosa cambia rispetto al 23/09, dalla diagnosi del 28/09:
//   - nessun tetto a 15 pagine: lo scarico persone riprende dalla pagina
//     successiva al giro dopo (apollo_people_scarico), fino al totale dichiarato
//   - companies.dipendenti (solo se vuoto) = total_entries dichiarato da
//     Apollo, non le persone scaricate (che col tetto si fermavano a 1.500)
//   - letture a pagine: una select senza range viene troncata dal max-rows di
//     PostgREST (company_workforce restituiva ~300 aziende su ~1.850)
//   - pool: tutte le aziende attive con sito, non solo quelle con archetipo;
//     senza archetipo si classifica il solo livello universale
//   - company_workforce si ricostruisce dall'archivio a scarico completo
// ─────────────────────────────────────────────────────────────────────────────
const RISCARICA_DOPO_GIORNI = 90;
const ORG_ARCHIVIA_TUTTE = process.env.APOLLO_ORG_ARCHIVIA_TUTTE === '1';

async function leggiTutte(nome, query, pagina = 1000) {
  const righe = [];
  for (let da = 0; ; da += pagina) {
    const { data, error } = await query().range(da, da + pagina - 1);
    if (error) throw new Error(`lettura ${nome} fallita: ${error.message}`);
    righe.push(...(data || []));
    if (!data || data.length < pagina) return righe;
  }
}

// Decision maker — stessi titoli di apollo-decision-makers.mjs
const TITOLI_HR = ['HR Director', 'Head of HR', 'Head of Talent Acquisition', 'Talent Acquisition Manager', 'HR Manager', 'Human Resources Manager', 'Chief Human Resources Officer', 'CHRO', 'Responsabile HR', 'Responsabile Risorse Umane', 'Direttore Risorse Umane', 'People & Culture Director'];
const TITOLI_CLEVEL = ['CEO', 'Chief Executive Officer', 'Amministratore Delegato', 'General Manager', 'Direttore Generale', 'Managing Director', 'Founder', 'Owner'];
function trovaDecisionMaker(persone) {
  const matchTitolo = (p, lista) => p.title && lista.some((t) => p.title.toLowerCase().includes(t.toLowerCase()));
  const hr = persone.find((p) => matchTitolo(p, TITOLI_HR));
  if (hr) return { persona: hr, categoria: 'HR/Talent Acquisition' };
  const cl = persone.find((p) => matchTitolo(p, TITOLI_CLEVEL));
  if (cl) return { persona: cl, categoria: 'C-level' };
  return null;
}

// Ricostruisce l'organico di UN'azienda dall'archivio: stesso principio di
// scripts/organico-classifica.mjs, qui limitato all'azienda appena scaricata.
async function ricostruisciWorkforce(companyId, persone, sectorV2) {
  const righe = persone.map((p) => rigaWorkforce(companyId, p, sectorV2)).filter(Boolean);
  const { error: eDel } = await supabase.from('company_workforce').delete().eq('company_id', companyId);
  if (eDel) throw new Error('company_workforce delete: ' + eDel.message);
  for (let i = 0; i < righe.length; i += 500) {
    const { error } = await supabase.from('company_workforce').insert(righe.slice(i, i + 500));
    if (error) throw new Error('company_workforce insert: ' + error.message);
  }
  return righe.length;
}

async function registraDecisionMaker(companyId, esito, note) {
  try {
    await supabase.from('company_facts_lookup_log').upsert(
      { company_id: companyId, tipo: DM_REGISTRO_TIPO, esito, note: note ? String(note).slice(0, 200) : null },
      { onConflict: 'company_id,tipo' }
    );
  } catch { /* volutamente silenzioso */ }
}

// `apply` di default true: quando lo chiama Vercel (cron), process.argv non
// contiene mai '--apply' — se questo parametro non esistesse, la produzione
// non scriverebbe mai nulla. Il CLI locale passa esplicitamente APPLY (che
// resta false di default per i test manuali sicuri), stesso principio del
// resto della famiglia CORE ma corretto qui per l'uso da funzione esportata.
async function runUnificatoDailyBatch(apply = true) {
  const log = [];
  const push = (msg) => { console.log(msg); log.push(msg); };
  push(`\nApollo unificato · fino a ${N_OGGI} aziende  ${apply ? 'SCRIVE' : 'solo misura'}\n`);
  const arc = creaArchivio(supabase, APOLLO_KEY, { scrivi: apply });

  const scarichi = new Map((await leggiTutte('apollo_people_scarico', () =>
    supabase.from('apollo_people_scarico').select('company_id,dominio,total_entries,scaricate,pagine,completo,esito,aggiornato_il,risposta_extra').order('company_id'))).map((r) => [r.company_id, r]));
  const dmTentate = new Set((await leggiTutte('registro decision maker', () =>
    supabase.from('company_facts_lookup_log').select('company_id').eq('tipo', DM_REGISTRO_TIPO).order('company_id'))).map((r) => r.company_id));
  // Domini condivisi (vedi scripts/lib/apollo-domini.mjs): le schede non
  // titolari non ricevono organico ne' decision maker — sarebbero la copia del
  // titolare, e il decision maker costerebbe un credito per la stessa persona.
  // Gruppi con capogruppo (scripts/lib/apollo-gruppi.mjs): l'organico dei
  // membri lo ricostruisce il gruppo a fine giro; il decision maker si cerca
  // solo sulla capogruppo (stesse persone, un credito solo).
  const { membri } = await membriDiGruppo(supabase);
  const gruppiToccati = new Set();
  const { nonTitolari } = await risolviDominiCondivisi(supabase, { scrivi: false, membri });
  const orgArchiviate = new Set((await leggiTutte('apollo_organizations_raw', () =>
    supabase.from('apollo_organizations_raw').select('company_id').order('company_id'))).map((r) => r.company_id));
  const pool = await leggiTutte('companies', () => supabase.from('companies')
    .select('id,name,website,sector_v2,dipendenti,fatturato_range,descrizione_aziendale,linkedin_url,crescita_dipendenti_12m,apollo_keywords,apollo_industry')
    .eq('is_active', true).is('merged_into', null).not('website', 'is', null)
    .order('dipendenti', { ascending: false, nullsFirst: false }).order('id'));

  // Priorita': 1) scarichi interrotti da riprendere, 2) mai scaricate,
  // 3) complete ma piu' vecchie di RISCARICA_DOPO_GIORNI (persone che cambiano).
  const soglia = Date.now() - RISCARICA_DOPO_GIORNI * 86400000;
  const code = [[], [], []];
  for (const c of pool) {
    const dominio = extractDomain(c.website);
    if (!dominio) continue;
    const s = scarichi.get(c.id);
    const voce = { ...c, dominio, stato: s || null };
    if (!s) code[1].push(voce);
    else if (!s.completo) code[0].push(voce);
    else if (new Date(s.aggiornato_il).getTime() < soglia) code[2].push(voce);
  }
  const candidati = [...code[0], ...code[1], ...code[2]].slice(0, N_OGGI);
  push(`candidati scelti: ${candidati.length} (da riprendere ${code[0].length}, mai scaricate ${code[1].length}, da aggiornare ${code[2].length}; pool ${pool.length})\n`);

  const startTime = Date.now();
  const scadenza = startTime + TIME_BUDGET_MS;
  let orgArricchite = 0, orgCreditiEsauriti = 0, workforceScritte = 0, personeTotali = 0, scarichiCompleti = 0;
  let dmScritti = 0, dmCreditiEsauriti = 0, errori = 0, timeBudgetExceeded = false;

  for (const c of candidati) {
    if (Date.now() > scadenza) { timeBudgetExceeded = true; push(`⏱️  Budget di tempo esaurito — mi fermo qui, riprende al prossimo run.`); break; }
    push(`${'='.repeat(70)}\n${c.name} (${c.sector_v2 || 'senza settore'}) · ${c.dominio}${c.stato && !c.stato.completo ? ` · riprendo da pagina ${c.stato.pagine + 1}` : ''}\n${'='.repeat(70)}`);

    // ── 1. organizations/enrich (a crediti) — risposta sempre archiviata intera ──
    const orgIncompleta = !c.fatturato_range || !c.descrizione_aziendale || !c.linkedin_url;
    if (apply && (orgIncompleta || (ORG_ARCHIVIA_TUTTE && !orgArchiviate.has(c.id)))) {
      try {
        const { org, abbinamento } = await arc.arricchisciOrganizzazione(c.id, c.dominio, (nome) => isPlausibleMatch(c.name, nome));
        if (org && abbinamento) {
          const patch = {};
          if (!c.fatturato_range) { const rr = revenueToRange(org.annual_revenue); if (rr) patch.fatturato_range = rr; }
          if (!c.descrizione_aziendale && org.short_description) patch.descrizione_aziendale = await translateDescriptionToItalian(org.short_description);
          if (!c.linkedin_url && org.linkedin_url) patch.linkedin_url = org.linkedin_url;
          if (c.crescita_dipendenti_12m == null && org.organization_headcount_twelve_month_growth != null) patch.crescita_dipendenti_12m = org.organization_headcount_twelve_month_growth;
          if ((!c.apollo_keywords || !c.apollo_keywords.length) && org.keywords?.length) patch.apollo_keywords = org.keywords;
          if (!c.apollo_industry && org.industry) patch.apollo_industry = org.industry;
          if (org.industries?.length) patch.apollo_industries = org.industries;
          if (Object.keys(patch).length) {
            await supabase.from('companies').update({ ...patch, arricchito_il: new Date().toISOString() }).eq('id', c.id);
            orgArricchite++;
            push(`  organizations/enrich: ${Object.keys(patch).join(', ')}`);
          }
          if (org.departmental_head_count) {
            const rows = Object.entries(org.departmental_head_count).filter(([, n]) => Number.isFinite(n)).map(([department, headcount]) => ({ company_id: c.id, department, headcount, fonte: 'apollo', rilevato_il: new Date().toISOString() }));
            if (rows.length) await supabase.from('company_department_headcount').upsert(rows, { onConflict: 'company_id,department' });
          }
        } else if (org) {
          push(`  organizations/enrich: mismatch con "${org.name}" — archiviato, non estratto`);
        }
      } catch (e) {
        if (e.message === 'CREDITI_ESAURITI') { orgCreditiEsauriti++; push(`  organizations/enrich: crediti esauriti, salto (si ritenta da solo quando tornano)`); }
        else { errori++; push(`  organizations/enrich ERRORE: ${e.message}`); }
      }
    }

    // ── 2. ricerca persone (gratuita) — ripresa a pagine, archiviata per intero ──
    let stato;
    try {
      ({ stato } = await arc.scaricaPersone(c.id, c.dominio, { statoPrecedente: c.stato, scadenza }));
    } catch (e) {
      errori++; push(`  people search ERRORE: ${e.message}`);
      continue;
    }
    push(`  persone: ${stato.scaricate}/${stato.total_entries ?? '?'} dichiarate, pagine ${stato.pagine}${stato.completo ? ' · completo' : ' · da riprendere'}`);
    if (!apply) continue;
    // Solo se vuoto, come prima: dipendenti arriva anche da altre fonti (es.
    // Luxottica 9.091 contro 3.219 persone viste da Apollo) e sui domini
    // condivisi total_entries e' quello dell'intero dominio (le 4 societa' GSK
    // avrebbero tutte 2.814). Il totale Apollo resta in apollo_people_scarico.
    if (!c.dipendenti && stato.total_entries) {
      await supabase.from('companies').update({ dipendenti: stato.total_entries }).eq('id', c.id);
    }
    if (!stato.completo) continue; // organico e decision maker solo a lista intera
    scarichiCompleti++;
    const membro = membri.get(c.id);
    if (membro) {
      gruppiToccati.add(membro.gruppoId);
      if (membro.capogruppoId !== c.id) { push(`  societa' di un gruppo: organico ricostruito dal gruppo, decision maker sulla capogruppo`); continue; }
    } else if (nonTitolari.has(c.id)) { push(`  dominio condiviso: le persone sono del titolare del dominio, niente organico ne' decision maker qui`); continue; }

    const persone = await leggiTutte('apollo_people_raw', () => supabase.from('apollo_people_raw')
      .select('apollo_person_id,title').eq('company_id', c.id).order('apollo_person_id'));
    personeTotali += persone.length;
    if (!membro) {
      try {
        const n = await ricostruisciWorkforce(c.id, persone, c.sector_v2);
        workforceScritte += n;
        push(`  organico: ${persone.length} persone, ${n} classificate`);
      } catch (e) { errori++; push(`  organico ERRORE: ${e.message}`); }
    }

    // 2b. decision maker — dentro la STESSA lista, mai una ricerca a parte
    if (!dmTentate.has(c.id)) {
      const trovato = trovaDecisionMaker(persone);
      if (!trovato) {
        push(`  decision maker: nessuno trovato in questa lista`);
        await registraDecisionMaker(c.id, 'nessun_dato', 'nessun HR/TA ne\' C-level nella lista persone gia\' scaricata');
      } else {
        try {
          const rivelato = await arc.rivelaPersona(c.id, trovato.persona.apollo_person_id);
          if (rivelato?.email) {
            const esistenti = await supabase.from('company_contacts').select('id,email').eq('company_id', c.id);
            const giaPresente = (esistenti.data || []).some((x) => x.email && x.email.toLowerCase() === rivelato.email.toLowerCase());
            if (!giaPresente) {
              await supabase.from('company_contacts').insert([{ company_id: c.id, nome: rivelato.name || null, ruolo: rivelato.title || null, email: rivelato.email, linkedin_url: rivelato.linkedin_url || null, fonte_scoperta: `Apollo.io (raccolta unificata, ${trovato.categoria})`, verificato: rivelato.email_status === 'verified' }]);
              dmScritti++;
              push(`  decision maker: ${rivelato.name} — ${rivelato.title} (${trovato.categoria})`);
            } else push(`  decision maker: ${rivelato.name} — gia' presente`);
            await registraDecisionMaker(c.id, 'con_dato', `${rivelato.name} — ${rivelato.title}`);
          } else {
            await registraDecisionMaker(c.id, 'nessun_dato', 'trovato ma nessuna email rivelabile');
          }
        } catch (e) {
          if (e.message === 'CREDITI_ESAURITI') { dmCreditiEsauriti++; push(`  decision maker: crediti esauriti, salto (si ritenta quando tornano)`); }
          else { errori++; push(`  decision maker ERRORE: ${e.message}`); }
        }
      }
    }
  }

  const inventario = await arc.chiudi();
  // Ricalcolo sui dati appena scaricati: decide sempre lo scarico piu' recente.
  if (apply && scarichiCompleti) {
    try {
      const { nonTitolari: aggiornati } = await risolviDominiCondivisi(supabase, { scrivi: true, membri });
      await togliOrganicoNonTitolari(supabase, [...aggiornati].filter((id) => !membri.has(id)));
      if (gruppiToccati.size) await ricostruisciGruppi(supabase, { scrivi: true, soloGruppi: gruppiToccati });
    } catch (e) { errori++; push(`  domini condivisi ERRORE: ${e.message}`); }
  }
  if (apply && scarichiCompleti) {
    const { error } = await supabase.rpc('apollo_rinfresca_riepiloghi');
    if (error) push(`  riepiloghi front-end NON rinfrescati: ${error.message}`);
  }
  const summary = { candidati: candidati.length, scarichi_completi: scarichiCompleti, org_arricchite: orgArricchite, org_crediti_esauriti: orgCreditiEsauriti, workforce_scritte: workforceScritte, persone_totali: personeTotali, decision_maker_scritti: dmScritti, dm_crediti_esauriti: dmCreditiEsauriti, chiamate_apollo: inventario.chiamate, errori, timeBudgetExceeded };
  push(`📊 RISULTATO: ${JSON.stringify(summary)}`);
  return { summary, log };
}

export { runUnificatoDailyBatch };
const isCLI = process.argv[1] && process.argv[1].includes('apollo-unificato-giornaliero.mjs');
if (isCLI) {
  runUnificatoDailyBatch(APPLY).catch((e) => { console.error('❌ ERRORE TOP-LEVEL:', e.message); process.exit(1); });
}
