/**
 * SEGNALI DA SPERIMENTAZIONE CLINICA · automazione notturna (ClinicalTrials.gov)
 * =============================================================================
 *   node scripts/trial-signals-giornaliero.mjs                  misura (non scrive)
 *   node scripts/trial-signals-giornaliero.mjs --apply          scrive (50 aziende)
 *   node scripts/trial-signals-giornaliero.mjs --apply --n=10   quantita' diversa
 *   node scripts/trial-signals-giornaliero.mjs --apply --company=<id>,<id>
 *
 * Ogni notte scansiona 50 aziende attive IN ORDINE ALFABETICO (tutte, qualunque
 * settore), poi ricomincia dalle piu' vecchie. Dato pubblico, gratuito, senza
 * chiave API: API v2 di ClinicalTrials.gov. Zero costo.
 *
 * Cerca gli studi con l'azienda come SPONSOR PRINCIPALE avviati dal 01/10/2023
 * (24 mesi + margine per gli studi poi interrotti) e tiene:
 *   - studi di fase II / III (anche solo all'estero: dato informativo)
 *   - studi di DISPOSITIVI MEDICI e diagnostici (intervento DEVICE / DIAGNOSTIC_TEST)
 *   - studi sospesi, interrotti o ritirati
 * Gli studi osservazionali, di fase I e di fase IV senza dispositivo non sono
 * segnali per il recruiting e restano fuori.
 *
 * ABBINAMENTO SPONSOR — mai deciso in silenzio:
 *   'confermato'  alias confermato in company_ct_sponsor_alias, oppure nome
 *                 identico a quello dell'azienda (tolte le forme societarie)
 *   'probabile'   il nome sponsor contiene (o e' contenuto nel) nome azienda:
 *                 salvato ma con affidabilita' ridotta di un livello e
 *                 visibile in v_company_trial_abbinamenti_da_verificare
 *   alias 'escluso' blocca falsi abbinamenti noti (es. Italfarmaco S.A)
 *
 * LIMITE DI TEMPO — la funzione Vercel dura al massimo 60 s e ClinicalTrials.gov
 * chiede di restare intorno alle 50 richieste/minuto: l'invocazione si ferma al
 * budget di tempo e quelle successive (cron a 5 e 10 minuti di distanza) riprendono
 * fino ad arrivare a N aziende nella giornata. Una scansione non riuscita
 * (errore di rete, 429) NON viene registrata, cosi' si ritenta.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
dotenv.config();

const CT_API = 'https://clinicaltrials.gov/api/v2/studies';
const FIELDS = [
  'NCTId', 'BriefTitle', 'OverallStatus', 'WhyStopped', 'StartDate', 'PrimaryCompletionDate',
  'LeadSponsorName', 'Condition', 'ConditionBrowseBranchName', 'Phase', 'StudyType',
  'EnrollmentCount', 'InterventionType', 'LocationCountry',
].join('|');
const STUDI_DAL = '2023-10-01';
const MAX_PAGINE = 4;
const MAX_STUDI_PER_AZIENDA = 300;
const STATI_FERMI = new Set(['TERMINATED', 'WITHDRAWN', 'SUSPENDED']);
const SPACING_MS = 700;

// ─────────────────────────────────────────────────────────────────────────────
// Nomi
// ─────────────────────────────────────────────────────────────────────────────
const PAROLE_SOCIETARIE = new Set([
  'spa', 'srl', 'srls', 'sas', 'snc', 'sa', 'ag', 'gmbh', 'inc', 'ltd', 'llc', 'plc', 'nv', 'bv',
  'societa', 'per', 'azioni', 'responsabilita', 'limitata', 'benefit', 'unipersonale', 'forma',
  'abbreviata', 'ed', 'con', 'sigla', 'and', 'company', 'co', 'corp', 'corporation',
]);
const PAROLE_PAESE = new Set(['italia', 'italy', 'italiana']);

function parole(nome) {
  return String(nome || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\ba\/s\b/g, ' ')
    .replace(/\bs\.\s?p\.\s?a\b\.?/g, ' spa ')
    .replace(/\bs\.\s?r\.\s?l\b\.?/g, ' srl ')
    .replace(/\bs\.\s?a\.\s?s\b\.?/g, ' sas ')
    .replace(/\bs\.\s?n\.\s?c\b\.?/g, ' snc ')
    .replace(/\bs\.\s?a\b\.?/g, ' sa ')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim().split(/\s+/).filter(Boolean);
}
function core(nome, togliPaese = false) {
  return parole(nome).filter((p) => !PAROLE_SOCIETARIE.has(p) && !(togliPaese && PAROLE_PAESE.has(p))).join(' ');
}
function contieneSequenza(lungo, corto) {
  if (!corto || corto.length < 5) return false;
  return ` ${lungo} `.includes(` ${corto} `);
}

// termini da cercare su CT.gov: alias confermati + nome ripulito (con e senza "Italia")
function terminiRicerca(nomeAzienda, aliasConfermati) {
  const t = new Set(aliasConfermati);
  for (const togli of [false, true]) {
    const c = core(nomeAzienda, togli);
    if (c.length >= 4) t.add(c);
  }
  return [...t].slice(0, 4);
}

function abbinaSponsor(sponsor, azienda, aliasConfermati, aliasEsclusi) {
  const cs = core(sponsor, true);
  if (aliasEsclusi.some((a) => core(a, true) === cs)) return null;
  if (aliasConfermati.some((a) => core(a, true) === cs)) return 'confermato';
  const ca = core(azienda, true);
  if (ca && ca === cs) return 'confermato';
  if (contieneSequenza(cs, ca) || contieneSequenza(ca, cs)) return 'probabile';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ClinicalTrials.gov
// ─────────────────────────────────────────────────────────────────────────────
let ultimaRichiesta = 0;
async function attendeSpaziatura() {
  const ora = Date.now();
  const attesa = Math.max(0, ultimaRichiesta + SPACING_MS - ora);
  ultimaRichiesta = ora + attesa;
  if (attesa) await new Promise((ok) => setTimeout(ok, attesa));
}

async function chiamaCT(params, tentativo = 1) {
  await attendeSpaziatura();
  const r = await fetch(`${CT_API}?${new URLSearchParams(params)}`, { headers: { Accept: 'application/json' } });
  if ((r.status === 429 || r.status >= 500) && tentativo <= 3) {
    await new Promise((ok) => setTimeout(ok, 2000 * tentativo));
    return chiamaCT(params, tentativo + 1);
  }
  if (!r.ok) throw new Error(`ClinicalTrials.gov HTTP ${r.status}`);
  return r.json();
}

async function cercaStudi(termini, filtroData, campi = FIELDS) {
  const query = termini.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');
  const studi = [];
  let token = null;
  for (let pag = 0; pag < MAX_PAGINE; pag++) {
    const params = { 'query.lead': query, 'filter.advanced': filtroData, pageSize: '100', sort: 'StartDate:desc', fields: campi };
    if (token) params.pageToken = token;
    const j = await chiamaCT(params);
    studi.push(...(j.studies || []));
    token = j.nextPageToken;
    if (!token) break;
  }
  return studi;
}

function leggiStudio(s) {
  const p = s.protocolSection || {};
  const st = p.statusModule || {};
  const luoghi = p.contactsLocationsModule?.locations || [];
  const data = (d) => {
    if (!d) return null;
    return /^\d{4}-\d{2}$/.test(d) ? `${d}-01` : d;
  };
  return {
    nct_id: p.identificationModule?.nctId,
    titolo: p.identificationModule?.briefTitle || null,
    sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name || '',
    stato: st.overallStatus || null,
    perche_interrotto: st.whyStopped || null,
    data_inizio: data(st.startDateStruct?.date),
    fine_primaria: data(st.primaryCompletionDateStruct?.date),
    tipo_studio: p.designModule?.studyType || null,
    fase: p.designModule?.phases || [],
    enrollment: p.designModule?.enrollmentInfo?.count ?? null,
    condizioni: p.conditionsModule?.conditions || [],
    tipo_intervento: [...new Set((p.armsInterventionsModule?.interventions || []).map((i) => i.type).filter(Boolean))],
    area_terapeutica: (s.derivedSection?.conditionBrowseModule?.conditionBranches || []).map((b) => b.name).join('; ') || null,
    n_centri_italia: luoghi.filter((l) => l.country === 'Italy').length,
    n_centri_totali: luoghi.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Segnale per studio
// ─────────────────────────────────────────────────────────────────────────────
function sogliaRecente() {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 24);
  return d.toISOString().slice(0, 10);
}
const LIVELLI = ['basso', 'medio', 'alto'];
const abbassa = (liv) => LIVELLI[Math.max(0, LIVELLI.indexOf(liv) - 1)];

function classifica(e, abbinamento) {
  const fermo = STATI_FERMI.has(e.stato);
  const device = e.tipo_intervento.some((t) => t === 'DEVICE' || t === 'DIAGNOSTIC_TEST');
  const f3 = e.fase.includes('PHASE3');
  const f2 = e.fase.includes('PHASE2');
  if (!fermo && !device && !f2 && !f3) return null;

  let tipo, aff, note = [];
  if (fermo) {
    tipo = 'interrotto';
    aff = (f3 || (e.enrollment || 0) >= 100) && e.n_centri_italia > 0 ? 'medio' : 'basso';
    if (e.perche_interrotto) note.push(`motivo: ${e.perche_interrotto.slice(0, 200)}`);
  } else if (device) {
    if (e.n_centri_italia > 0) { tipo = 'device_italia'; aff = 'medio'; } else { tipo = 'solo_estero'; aff = 'basso'; }
  } else if (f3) {
    if (e.n_centri_italia > 0) { tipo = 'fase3_italia'; aff = 'alto'; } else { tipo = 'solo_estero'; aff = 'medio'; }
  } else {
    if (e.n_centri_italia > 0) { tipo = 'fase2_italia'; aff = 'medio'; } else { tipo = 'solo_estero'; aff = 'basso'; }
  }
  if (e.data_inizio && e.data_inizio < sogliaRecente()) {
    note.push('avviato prima della finestra di 24 mesi (studio in corso)');
    if (tipo !== 'interrotto') aff = abbassa(aff);
  }
  if (abbinamento === 'probabile') {
    note.push('abbinamento sponsor non confermato');
    aff = abbassa(aff);
  }
  return { tipo_segnale: tipo, affidabilita_segnale: aff, segnale_note: note.join(' · ') || null };
}

const PAROLE_GENERICHE = new Set(['disease', 'syndrome', 'disorder', 'patients', 'healthy', 'treatment', 'advanced', 'metastatic', 'chronic', 'acute']);
function paroleCondizioni(condizioni) {
  const s = new Set();
  for (const c of condizioni) for (const w of parole(c)) if (w.length >= 5 && !PAROLE_GENERICHE.has(w)) s.add(w);
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Una azienda
// ─────────────────────────────────────────────────────────────────────────────
async function scansionaAzienda(azienda, aliasAz) {
  const confermati = aliasAz.filter((a) => a.stato === 'confermato').map((a) => a.alias);
  const esclusi = aliasAz.filter((a) => a.stato === 'escluso').map((a) => a.alias);
  const termini = terminiRicerca(azienda.name, confermati);
  if (!termini.length) return { esito: 'nessuno_studio', righe: [], nota: 'nome troppo corto per una ricerca affidabile' };

  const grezzi = await cercaStudi(termini, `AREA[StartDate]RANGE[${STUDI_DAL},MAX]`);
  const righe = [];
  for (const g of grezzi) {
    const e = leggiStudio(g);
    if (!e.nct_id) continue;
    const abb = abbinaSponsor(e.sponsor, azienda.name, confermati, esclusi);
    if (!abb) continue;
    const sig = classifica(e, abb);
    if (!sig) continue;
    righe.push({ ...e, abbinamento: abb, ...sig });
  }
  if (!righe.length) return { esito: 'nessuno_studio', righe: [], nota: `${grezzi.length} studi restituiti, nessuno rilevante` };

  // area nuova: confronto con le condizioni degli studi precedenti dello stesso sponsor
  try {
    const vecchi = await cercaStudi(termini, `AREA[StartDate]RANGE[MIN,${new Date(STUDI_DAL).toISOString().slice(0, 10)}]`, 'NCTId|LeadSponsorName|Condition');
    const note = new Set();
    for (const v of vecchi) {
      const p = v.protocolSection || {};
      if (!abbinaSponsor(p.sponsorCollaboratorsModule?.leadSponsor?.name || '', azienda.name, confermati, esclusi)) continue;
      for (const w of paroleCondizioni(p.conditionsModule?.conditions || [])) note.add(w);
    }
    if (note.size) {
      for (const r of righe) {
        const pr = paroleCondizioni(r.condizioni);
        if (pr.size && [...pr].every((w) => !note.has(w))) r.area_nuova = true;
      }
    }
  } catch { /* l'area nuova e' un di piu': il fallimento non blocca lo scan */ }

  righe.sort((a, b) => (b.n_centri_italia > 0) - (a.n_centri_italia > 0) || String(b.data_inizio).localeCompare(String(a.data_inizio)));
  return { esito: 'ok', righe: righe.slice(0, MAX_STUDI_PER_AZIENDA), nota: righe.length > MAX_STUDI_PER_AZIENDA ? `${righe.length} studi, tenuti ${MAX_STUDI_PER_AZIENDA}` : null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Selezione aziende e batch
// ─────────────────────────────────────────────────────────────────────────────
async function tutti(supabase, tabella, colonne, filtro = (q) => q) {
  const out = [];
  for (let da = 0; ; da += 1000) {
    const { data, error } = await filtro(supabase.from(tabella).select(colonne)).range(da, da + 999);
    if (error) throw new Error(`${tabella}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export async function runTrialSignalsDailyBatch({ n = 50, apply = false, companyIds = null, timeBudgetMs = 50000 } = {}) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const inizio = Date.now();

  const aziende = await tutti(supabase, 'companies', 'id,name', (q) => q.eq('is_active', true).is('merged_into', null).order('id'));
  const log = await tutti(supabase, 'company_trial_scan_log', 'company_id,scanned_at', (q) => q.order('company_id'));
  const alias = await tutti(supabase, 'company_ct_sponsor_alias', 'company_id,alias,stato', (q) => q.order('id'));
  const aliasPer = new Map();
  for (const a of alias) { if (!aliasPer.has(a.company_id)) aliasPer.set(a.company_id, []); aliasPer.get(a.company_id).push(a); }
  const logPer = new Map(log.map((l) => [l.company_id, l.scanned_at]));

  const chiave = (nome) => nome.replace(/^[^\p{L}\p{N}]+/u, '');
  const perNome = (a, b) => chiave(a.name).localeCompare(chiave(b.name), 'it', { sensitivity: 'base' });
  let scelte;
  let quota = n;
  if (companyIds?.length) {
    scelte = aziende.filter((a) => companyIds.includes(a.id)).sort(perNome);
  } else {
    const oggi = new Date(); oggi.setUTCHours(0, 0, 0, 0);
    const fatteOggi = log.filter((l) => new Date(l.scanned_at) >= oggi).length;
    quota = Math.max(0, n - fatteOggi);
    const mai = aziende.filter((a) => !logPer.has(a.id)).sort(perNome);
    const vecchie = aziende.filter((a) => logPer.has(a.id))
      .sort((a, b) => String(logPer.get(a.id)).localeCompare(String(logPer.get(b.id))) || perNome(a, b));
    scelte = [...mai, ...vecchie].slice(0, quota);
  }

  const riepilogo = { aziende_totali: aziende.length, mai_scansionate: aziende.filter((a) => !logPer.has(a.id)).length, richieste: scelte.length, quota_residua_oggi: quota, scansionate: 0, con_studi: 0, studi_salvati: 0, errori: [], fermato_per_tempo: false, apply };
  if (!scelte.length) return riepilogo;

  const dettagli = [];
  let prossimo = 0;
  async function lavoratore() {
    while (prossimo < scelte.length) {
      if (Date.now() - inizio > timeBudgetMs) { riepilogo.fermato_per_tempo = true; return; }
      const az = scelte[prossimo++];
      try {
        const r = await scansionaAzienda(az, aliasPer.get(az.id) || []);
        riepilogo.scansionate++;
        if (r.righe.length) riepilogo.con_studi++;
        riepilogo.studi_salvati += r.righe.length;
        dettagli.push({ azienda: az.name, esito: r.esito, studi: r.righe.length, nota: r.nota, esempi: r.righe.slice(0, 3).map((x) => `${x.nct_id} ${x.tipo_segnale}/${x.affidabilita_segnale} ${x.abbinamento}`) });
        if (apply) {
          if (r.righe.length) {
            const adesso = new Date().toISOString();
            const { error } = await supabase.from('company_trial_signals').upsert(
              r.righe.map((x) => ({
                company_id: az.id, nct_id: x.nct_id, sponsor_ct: x.sponsor, abbinamento: x.abbinamento, titolo: x.titolo,
                tipo_studio: x.tipo_studio, fase: x.fase, stato: x.stato, tipo_intervento: x.tipo_intervento,
                condizioni: x.condizioni, area_terapeutica: x.area_terapeutica, data_inizio: x.data_inizio,
                fine_primaria: x.fine_primaria, enrollment: x.enrollment, n_centri_italia: x.n_centri_italia,
                n_centri_totali: x.n_centri_totali, perche_interrotto: x.perche_interrotto, tipo_segnale: x.tipo_segnale,
                affidabilita_segnale: x.affidabilita_segnale, area_nuova: !!x.area_nuova, segnale_note: x.segnale_note,
                aggiornato_il: adesso,
              })),
              { onConflict: 'company_id,nct_id' },
            );
            if (error) throw new Error(`scrittura segnali: ${error.message}`);
          }
          const { error: eLog } = await supabase.from('company_trial_scan_log').upsert(
            { company_id: az.id, scanned_at: new Date().toISOString(), esito: r.esito, n_studi: r.righe.length, nota: r.nota },
            { onConflict: 'company_id' },
          );
          if (eLog) throw new Error(`scrittura registro: ${eLog.message}`);
        }
      } catch (err) {
        riepilogo.errori.push(`${az.name}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, lavoratore));
  riepilogo.durata_ms = Date.now() - inizio;
  riepilogo.dettagli = dettagli;
  return riepilogo;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
  const ids = arg('company') ? arg('company').split(',').map((s) => s.trim()).filter(Boolean) : null;
  const r = await runTrialSignalsDailyBatch({ n: Number(arg('n') || 50), apply: process.argv.includes('--apply'), companyIds: ids, timeBudgetMs: 600000 });
  const { dettagli, ...resto } = r;
  console.log(JSON.stringify(resto, null, 2));
  for (const d of dettagli || []) console.log(`- ${d.azienda}: ${d.esito}, ${d.studi} studi${d.nota ? ` (${d.nota})` : ''}${d.esempi.length ? ' | ' + d.esempi.join(' ; ') : ''}`);
  if (!r.apply) console.log('\n(misura: non ho scritto nulla. Usa --apply per scrivere.)');
}
