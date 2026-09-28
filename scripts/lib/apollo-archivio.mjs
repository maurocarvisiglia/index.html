/**
 * ARCHIVIO APOLLO SENZA PERDITE — unica porta d'accesso ad Apollo (28/09/2026)
 * =============================================================================
 * Diagnosi del 28/09: nessuna risposta Apollo veniva conservata, e dei campi
 * restituiti se ne leggeva una minima parte. Da qui in poi ogni chiamata passa
 * da questo modulo, che:
 *   1. registra la chiamata in apollo_chiamate (anche se fallisce)
 *   2. conserva la risposta per intero (tabelle *_raw, vedi migration
 *      20260928130000_apollo_people_archivio.sql)
 *   3. aggiorna l'inventario apollo_campi_visti con ogni percorso di campo visto
 *
 * Le persone della ricerca sono normalizzate (piano Supabase gratuito): campi
 * noti in colonna, qualunque campo non previsto in `extra`. Nulla va perso.
 *
 * Uso:
 *   const arc = creaArchivio(supabase, APOLLO_KEY, { scrivi: true });
 *   const { data } = await arc.cercaPersone(companyId, dominio, pagina);
 *   await arc.salvaPersone(companyId, data.people);
 *   ...
 *   await arc.chiudi();   // scarica inventario e registro chiamate
 */
import { createHash } from 'node:crypto';

const BASE = 'https://api.apollo.io/api/v1';
const PERSONA_BOOL = ['has_email', 'has_city', 'has_state', 'has_country'];
const PERSONA_NOTI = new Set(['id', 'first_name', 'last_name_obfuscated', 'title', 'last_refreshed_at', 'has_direct_phone', 'organization', ...PERSONA_BOOL]);
const TELEFONO = { Yes: 'si', 'Maybe: please request direct dial via people/bulk_match': 'forse' };

const attendi = (ms) => new Promise((ok) => setTimeout(ok, ms));
const impronta = (obj) => createHash('sha1').update(JSON.stringify(obj)).digest('hex').slice(0, 12);

export function estraiDominio(url) {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase() || null;
  } catch { return null; }
}

// Percorsi di campo: gli array diventano "[]", le mappe con chiavi-dato (es.
// departmental_head_count) restano chiavi esplicite — sono poche e stabili.
function percorriCampi(valore, percorso, visita) {
  if (Array.isArray(valore)) {
    visita(percorso + '[]', 'array', null);
    for (const v of valore) percorriCampi(v, percorso + '[]', visita);
  } else if (valore && typeof valore === 'object') {
    for (const [k, v] of Object.entries(valore)) percorriCampi(v, percorso ? `${percorso}.${k}` : k, visita);
  } else {
    visita(percorso, valore === null ? 'null' : typeof valore, valore);
  }
}

export function creaArchivio(supabase, apolloKey, { scrivi = true, pausaMs = 320 } = {}) {
  const campi = new Map();
  const chiamate = [];
  const orgViste = new Set();

  function inventaria(endpoint, risposta) {
    percorriCampi(risposta, '', (percorso, tipo, valore) => {
      const k = `${endpoint}\u0000${percorso}`;
      const c = campi.get(k) || { endpoint, percorso, tipo, volte: 0, esempio: null };
      c.volte++;
      if (tipo !== 'null') c.tipo = tipo;
      if (c.esempio == null && valore != null && valore !== '') c.esempio = String(valore).slice(0, 200);
      campi.set(k, c);
    });
  }

  async function chiama(endpoint, { metodo = 'POST', corpo, query, companyId = null, chiave = null }, tentativo = 1) {
    const url = `${BASE}/${endpoint}${query ? '?' + new URLSearchParams(query) : ''}`;
    let r, testo;
    try {
      r = await fetch(url, {
        method: metodo,
        headers: { 'x-api-key': apolloKey, 'Content-Type': 'application/json' },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      testo = await r.text();
    } catch (e) {
      chiamate.push({ endpoint, company_id: companyId, chiave, http_status: null, esito: 'errore', errore: String(e.message).slice(0, 300) });
      throw e;
    }
    if (r.status === 429 && tentativo <= 5) {
      chiamate.push({ endpoint, company_id: companyId, chiave, http_status: 429, esito: 'rate_limit', errore: null });
      await attendi(65000);
      return chiama(endpoint, { metodo, corpo, query, companyId, chiave }, tentativo + 1);
    }
    const esito = r.ok ? 'ok' : (r.status === 402 || r.status === 422) ? 'crediti_esauriti' : r.status === 429 ? 'rate_limit' : 'errore';
    chiamate.push({ endpoint, company_id: companyId, chiave, http_status: r.status, esito, errore: r.ok ? null : testo.slice(0, 300) });
    if (!r.ok) {
      const err = new Error(esito === 'crediti_esauriti' ? 'CREDITI_ESAURITI' : `${endpoint} HTTP ${r.status}: ${testo.slice(0, 160)}`);
      err.esito = esito;
      throw err;
    }
    const data = JSON.parse(testo);
    inventaria(endpoint, data);
    if (pausaMs) await attendi(pausaMs);
    return data;
  }

  // ── ricerca persone (gratuita) ────────────────────────────────────────────
  const cercaPersone = (companyId, dominio, pagina) => chiama('mixed_people/api_search', {
    corpo: { q_organization_domains_list: [dominio], person_locations: ['Italy'], page: pagina, per_page: 100 },
    companyId, chiave: `${dominio}#${pagina}`,
  });

  function personaInRiga(companyId, p) {
    const extra = {};
    for (const [k, v] of Object.entries(p)) if (!PERSONA_NOTI.has(k)) extra[k] = v;
    const riga = {
      company_id: companyId, apollo_person_id: p.id,
      first_name: p.first_name ?? null, last_name_obfuscated: p.last_name_obfuscated ?? null,
      title: p.title ?? null, last_refreshed_at: p.last_refreshed_at ?? null,
      has_direct_phone: p.has_direct_phone == null ? null : (TELEFONO[p.has_direct_phone] || String(p.has_direct_phone)),
      org_impronta: p.organization ? impronta(p.organization) : null,
      ultimo_visto_il: new Date().toISOString(),
    };
    for (const k of PERSONA_BOOL) {
      if (typeof p[k] === 'boolean' || p[k] == null) riga[k] = p[k] ?? null;
      else { riga[k] = null; extra[k] = p[k]; } // tipo inatteso: non si forza, si conserva
    }
    if (p.has_direct_phone != null && typeof p.has_direct_phone !== 'string') extra.has_direct_phone = p.has_direct_phone;
    riga.extra = Object.keys(extra).length ? extra : null;
    return riga;
  }

  async function salvaPersone(companyId, persone) {
    if (!scrivi || !persone?.length) return 0;
    const orgNuove = [];
    for (const p of persone) {
      if (!p.organization) continue;
      const h = impronta(p.organization);
      if (orgViste.has(h)) continue;
      orgViste.add(h);
      orgNuove.push({ impronta: h, nome: p.organization.name ?? null, payload: p.organization });
    }
    if (orgNuove.length) {
      const { error } = await supabase.from('apollo_people_org').upsert(orgNuove, { onConflict: 'impronta', ignoreDuplicates: true });
      if (error) throw new Error('apollo_people_org: ' + error.message);
    }
    const visti = new Set();
    const righe = persone.filter((p) => p.id && !visti.has(p.id) && visti.add(p.id)).map((p) => personaInRiga(companyId, p));
    for (let i = 0; i < righe.length; i += 500) {
      const { error } = await supabase.from('apollo_people_raw').upsert(righe.slice(i, i + 500), { onConflict: 'company_id,apollo_person_id' });
      if (error) throw new Error('apollo_people_raw: ' + error.message);
    }
    return righe.length;
  }

  async function aggiornaScarico(riga) {
    if (!scrivi) return;
    const { error } = await supabase.from('apollo_people_scarico').upsert({ ...riga, aggiornato_il: new Date().toISOString() }, { onConflict: 'company_id' });
    if (error) throw new Error('apollo_people_scarico: ' + error.message);
  }

  /**
   * Scarica (o riprende) la ricerca persone di un'azienda. Salva ogni pagina
   * appena arriva, cosi' un'interruzione non perde nulla e la volta dopo si
   * riparte dalla pagina successiva. `scadenza` (timestamp ms) ferma lo scarico
   * tra una pagina e l'altra, per le funzioni serverless con tempo limitato.
   */
  async function scaricaPersone(companyId, dominio, { statoPrecedente = null, scadenza = Infinity, maxPagine = 500 } = {}) {
    const stato = {
      company_id: companyId, dominio,
      total_entries: statoPrecedente?.total_entries ?? null,
      scaricate: statoPrecedente?.scaricate ?? 0,
      pagine: statoPrecedente?.completo ? 0 : (statoPrecedente?.pagine ?? 0),
      completo: false, esito: 'in_corso', errore: null,
      risposta_extra: statoPrecedente?.risposta_extra ?? null,
    };
    if (statoPrecedente?.completo) stato.scaricate = 0;
    const persone = [];
    try {
      while (stato.pagine < maxPagine) {
        if (Date.now() > scadenza) break;
        const n = stato.pagine + 1;
        const d = await cercaPersone(companyId, dominio, n);
        if (n === 1) {
          stato.total_entries = d.total_entries ?? null;
          const altro = Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'people' && k !== 'total_entries'));
          stato.risposta_extra = Object.keys(altro).length ? altro : null;
        }
        const pag = d.people || [];
        await salvaPersone(companyId, pag);
        persone.push(...pag);
        stato.pagine = n;
        stato.scaricate += pag.length;
        if (pag.length < 100 || (stato.total_entries != null && stato.scaricate >= stato.total_entries)) {
          stato.completo = true;
          stato.esito = stato.scaricate ? 'completo' : 'zero_risultati';
          break;
        }
      }
    } catch (e) {
      stato.esito = 'errore';
      stato.errore = String(e.message).slice(0, 300);
      await aggiornaScarico(stato);
      throw e;
    }
    await aggiornaScarico(stato);
    return { stato, persone };
  }

  // ── organizations/enrich (a crediti) ──────────────────────────────────────
  async function arricchisciOrganizzazione(companyId, dominio, verificaNome) {
    const d = await chiama('organizations/enrich', { metodo: 'GET', query: { domain: dominio }, companyId, chiave: dominio });
    const org = d.organization || null;
    const abbinamento = !!(org && verificaNome(org.name));
    if (scrivi && d) {
      const { error } = await supabase.from('apollo_organizations_raw').upsert({
        company_id: companyId, dominio, apollo_org_id: org?.id ?? null, nome_apollo: org?.name ?? null,
        abbinamento_ok: abbinamento, payload: d, ricevuto_il: new Date().toISOString(),
      }, { onConflict: 'company_id' });
      if (error) throw new Error('apollo_organizations_raw: ' + error.message);
    }
    return { org, abbinamento, risposta: d };
  }

  // ── people/match (a crediti) ──────────────────────────────────────────────
  async function rivelaPersona(companyId, personId) {
    const d = await chiama('people/match', { corpo: { id: personId }, companyId, chiave: personId });
    if (scrivi && d) {
      const { error } = await supabase.from('apollo_people_match_raw').upsert({
        apollo_person_id: personId, company_id: companyId, email_status: d.person?.email_status ?? null,
        payload: d, ricevuto_il: new Date().toISOString(),
      }, { onConflict: 'apollo_person_id' });
      if (error) throw new Error('apollo_people_match_raw: ' + error.message);
    }
    return d.person || null;
  }

  async function chiudi() {
    if (!scrivi) return { campi: campi.size, chiamate: chiamate.length };
    const elenco = [...campi.values()];
    for (let i = 0; i < elenco.length; i += 500) {
      const { error } = await supabase.rpc('apollo_registra_campi', { campi: elenco.slice(i, i + 500) });
      if (error) console.error('inventario campi:', error.message);
    }
    for (let i = 0; i < chiamate.length; i += 500) {
      const { error } = await supabase.from('apollo_chiamate').insert(chiamate.slice(i, i + 500));
      if (error) console.error('registro chiamate:', error.message);
    }
    const riepilogo = { campi: campi.size, chiamate: chiamate.length };
    campi.clear(); chiamate.length = 0;
    return riepilogo;
  }

  return { chiama, cercaPersone, salvaPersone, scaricaPersone, aggiornaScarico, arricchisciOrganizzazione, rivelaPersona, inventaria, chiudi };
}
