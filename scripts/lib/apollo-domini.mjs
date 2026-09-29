/**
 * DOMINI CONDIVISI — un solo titolare per dominio (28/09/2026)
 * =============================================================================
 * Apollo cerca le persone per dominio, quindi tutte le aziende con lo stesso
 * sito ricevono la stessa lista (lafarmacia.it: 35 aziende, gsk.com: 5).
 * Dentro un dominio Apollo attribuisce a tutte le persone la STESSA
 * organizzazione: quel nome dice di chi sono. Qui si sceglie il titolare:
 *
 *   1. nome Apollo dall'ULTIMO scarico del dominio (dato piu' recente)
 *   2. confronto sulle sole parole distintive (non "S.p.A.", "Italia",
 *      "Farmacia", "Hospital"...): serve che la scheda copra almeno meta' delle
 *      parole distintive dell'organizzazione, altrimenti nessun titolare
 *      (lafarmacia.it -> "Farmacia Ninci", gvmnet.it -> "GVM Care & Research")
 *   3. punteggio = media armonica delle due coperture, cosi' "Fresenius Kabi"
 *      batte "Fresenius Kabi Deutsch.gmbh" per l'organizzazione "Fresenius Kabi"
 *   4. a parita', la scheda aggiornata piu' di recente
 *
 * Il risultato va in apollo_domini_titolari; classificatore e job giornaliero
 * lo ricalcolano a ogni esecuzione, quindi decide sempre il dato piu' recente.
 */

const GENERICHE = new Set(`
  spa srl srls sas snc ltd limited gmbh ag bv nv sa sas slu sl dac inc llc plc kft oy ab as co corp
  societa per azioni responsabilita limitata semplificata unipersonale socio unico benefit soggetta
  direzione coordinamento breve forma abbreviata sigla enunciabile anche sotto esercizio
  italia italy italiana italiano international internazionale europe global group gruppo holding
  the and del della dei delle degli dello di da con per fratelli lli
  farmaceutici farmaceutica farmaceutico farmacia farmacie pharma pharmaceutical pharmaceuticals pharmaceutique
  healthcare health care medical medicines laboratorio laboratori laboratoire laboratories lab labs
  istituto clinica clinico clinic hospital ospedale casa cura research ricerca services servizi solutions
  san santa sant santo villa citta nuova
`.split(/\s+/).filter(Boolean));

function parole(nome) {
  return (nome || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter((p) => p.length > 1 && !GENERICHE.has(p));
}

// Sigla: "LFM SPA" e' il "Laboratorio Farmacologico Milanese" — iniziali di
// TUTTE le parole (anche generiche), senza le forme societarie.
const FORME = new Set(['spa', 'srl', 'srls', 'sas', 'snc', 'ltd', 'gmbh', 'ag', 'bv', 'sa', 'slu', 'inc', 'llc', 'plc']);
function iniziali(nome) {
  return (nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter((p) => p.length > 1 && !FORME.has(p)).map((p) => p[0]).join('');
}
// Stessa parola o una contenuta nell'altra ("quidelortho" contiene "quidel"),
// solo da 5 lettere in su per non abbinare frammenti casuali.
const combacia = (x, y) => x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)));

export function punteggioNome(nomeAzienda, nomeOrg) {
  const a = new Set(parole(nomeAzienda));
  const o = new Set(parole(nomeOrg));
  if (!a.size || !o.size) return 0;
  if ([...a].join('') === [...o].join('')) return 1;
  if (o.size === 1 && [...o][0].length >= 3 && [...o][0] === iniziali(nomeAzienda)) return 1;
  const comuni = [...o].filter((p) => [...a].some((q) => combacia(p, q))).length;
  const copreOrg = comuni / o.size;
  const copreAzienda = comuni / a.size;
  if (copreOrg < 0.5) return 0;
  return (2 * copreOrg * copreAzienda) / (copreOrg + copreAzienda);
}

async function leggiTutte(supabase, nome, query, pagina = 1000) {
  const righe = [];
  for (let da = 0; ; da += pagina) {
    const { data, error } = await query().range(da, da + pagina - 1);
    if (error) throw new Error(`lettura ${nome} fallita: ${error.message}`);
    righe.push(...(data || []));
    if (!data || data.length < pagina) return righe;
  }
}

/**
 * Ricalcola i titolari di tutti i domini condivisi dall'ultimo scarico.
 * Ritorna { titolari: Map(dominio -> company_id|null), nonTitolari: Set(company_id) }.
 * Con scrivi=false calcola soltanto (per le misure).
 */
// unisciPerSovrapposizione: raggruppa anche domini DIVERSI con le stesse persone
// (it.gsk.com + gsk.com). Spento di default: Mauro ha chiesto di vedere le
// aziende e decidere prima di unirle (28/09/2026). I gruppi con capogruppo
// coprono gia' i casi decisi.
export async function risolviDominiCondivisi(supabase, { scrivi = true, membri = new Map(), unisciPerSovrapposizione = false } = {}) {
  const scarichi = await leggiTutte(supabase, 'apollo_people_scarico', () =>
    supabase.from('apollo_people_scarico').select('company_id,dominio,aggiornato_il,scaricate').order('company_id'));
  // Gruppi (28/09/2026, seconda passata): stesso dominio OPPURE almeno meta'
  // della lista piu' corta in comune. La stessa organizzazione Apollo risponde
  // a piu' domini (it.gsk.com / gsk.com, recordati.it / recordati.com): col
  // solo dominio restavano 10.928 persone doppie in organico.
  const padre = new Map(scarichi.map((s) => [s.company_id, s.company_id]));
  const radice = (x) => { while (padre.get(x) !== x) { padre.set(x, padre.get(padre.get(x))); x = padre.get(x); } return x; };
  const unisci = (a, b) => { if (padre.has(a) && padre.has(b)) padre.set(radice(a), radice(b)); };
  const primoPerDominio = new Map();
  for (const s of scarichi) {
    if (primoPerDominio.has(s.dominio)) unisci(s.company_id, primoPerDominio.get(s.dominio));
    else primoPerDominio.set(s.dominio, s.company_id);
  }
  if (unisciPerSovrapposizione) {
    const { data: coppie, error: eCoppie } = await supabase.from('v_apollo_coppie_sovrapposte').select('company_a,company_b,comuni,lista_piu_corta');
    if (eCoppie) throw new Error('v_apollo_coppie_sovrapposte: ' + eCoppie.message);
    for (const c of coppie || []) if (c.comuni * 2 >= c.lista_piu_corta) unisci(c.company_a, c.company_b);
  }

  const perGruppo = new Map();
  for (const s of scarichi) {
    const r = radice(s.company_id);
    if (!perGruppo.has(r)) perGruppo.set(r, []);
    perGruppo.get(r).push(s);
  }
  const condivisi = [...perGruppo.values()].filter((v) => v.length > 1).map((lista) => {
    const conta = new Map();
    lista.forEach((s) => conta.set(s.dominio, (conta.get(s.dominio) || 0) + 1));
    const domini = [...conta.keys()].sort((a, b) => conta.get(b) - conta.get(a) || a.length - b.length || a.localeCompare(b));
    return { dominio: domini[0], domini: [...domini].sort(), lista };
  });
  const ids = condivisi.flatMap((g) => g.lista.map((s) => s.company_id));

  const aziende = new Map();
  const varianti = new Map(); // company_id -> [{org_nome, persone}]
  for (let i = 0; i < ids.length; i += 150) {
    const lotto = ids.slice(i, i + 150);
    const { data: c, error: e1 } = await supabase.from('companies')
      .select('id,name,is_active,merged_into,arricchito_il,created_at').in('id', lotto);
    if (e1) throw new Error('companies: ' + e1.message);
    c.forEach((x) => aziende.set(x.id, x));
    const { data: v, error: e2 } = await supabase.from('v_fe_apollo_org_varianti')
      .select('company_id,org_nome,persone').in('company_id', lotto);
    if (e2) throw new Error('v_fe_apollo_org_varianti: ' + e2.message);
    v.forEach((x) => { if (!varianti.has(x.company_id)) varianti.set(x.company_id, []); varianti.get(x.company_id).push(x); });
  }

  const recente = (x) => Math.max(Date.parse(x?.arricchito_il || 0) || 0, Date.parse(x?.created_at || 0) || 0);
  const titolari = new Map();
  const nonTitolari = new Set();
  const righe = [];
  for (const { dominio, domini, lista } of condivisi) {
    // 1. organizzazione Apollo dall'ultimo scarico del dominio che ha persone
    const ultimo = [...lista].filter((s) => s.scaricate > 0)
      .sort((a, b) => Date.parse(b.aggiornato_il) - Date.parse(a.aggiornato_il))[0];
    const org = ultimo ? (varianti.get(ultimo.company_id) || []).sort((a, b) => b.persone - a.persone)[0]?.org_nome ?? null : null;

    const candidati = lista
      .map((s) => aziende.get(s.company_id))
      .filter((c) => c && c.is_active && !c.merged_into)
      .map((c) => ({ company_id: c.id, name: c.name, punteggio: Number(punteggioNome(c.name, org).toFixed(3)), recente: recente(c) }))
      .sort((a, b) => b.punteggio - a.punteggio || b.recente - a.recente);

    const primo = candidati[0];
    // Struttura di un gruppo (gvmnet.it: 9 ospedali, solo "Anthea Hospital – GVM"
    // cita il gruppo "GVM Care & Research"): un'unica scheda che corrisponde solo
    // in parte, fra 3 o piu', e' una sede del gruppo, non il gruppo — le persone
    // del gruppo intero non le si attribuiscono.
    const parziali = candidati.filter((c) => c.punteggio > 0);
    const sedeDiGruppo = primo && primo.punteggio < 1 && parziali.length === 1 && candidati.length >= 3;
    // Dominio di un gruppo con capogruppo (scripts/lib/apollo-gruppi.mjs): le
    // persone le distribuisce il gruppo, le schede fuori dal gruppo non ne ricevono.
    const delGruppo = candidati.filter((c) => membri.has(c.company_id))
      .sort((a, b) => (membri.get(b.company_id).capogruppoId === b.company_id) - (membri.get(a.company_id).capogruppoId === a.company_id))[0];
    const titolare = delGruppo || (primo && primo.punteggio > 0 && !sedeDiGruppo ? primo : null);
    const pari = titolare ? candidati.filter((c) => c.punteggio === titolare.punteggio).length : 0;
    const base = delGruppo ? `dominio di un gruppo con capogruppo: le persone le attribuisce il gruppo (organizzazione Apollo "${org}")`
      : !org ? 'nessuna persona su Apollo per questo dominio'
      : sedeDiGruppo ? `"${primo.name}" sembra una sede del gruppo "${org}", non il gruppo: nessun titolare`
      : !titolare ? `nessuna scheda corrisponde all'organizzazione Apollo "${org}"`
      : pari > 1 ? `${pari} schede corrispondono ugualmente a "${org}": scelta la piu' recente`
      : `corrisponde all'organizzazione Apollo "${org}"`;
    const motivo = domini.length > 1 ? `${base} (stessa organizzazione su ${domini.length} domini: ${domini.join(', ')})` : base;

    titolari.set(dominio, titolare?.company_id ?? null);
    for (const s of lista) if (s.company_id !== titolare?.company_id) nonTitolari.add(s.company_id);
    righe.push({
      dominio, domini, company_id: titolare?.company_id ?? null, org_nome: org, punteggio: titolare?.punteggio ?? null, motivo,
      candidati: candidati.map(({ company_id, name, punteggio }) => ({ company_id, name, punteggio })),
      deciso_il: new Date().toISOString(),
    });
  }

  if (scrivi) {
    for (let i = 0; i < righe.length; i += 200) {
      const { error } = await supabase.from('apollo_domini_titolari').upsert(righe.slice(i, i + 200), { onConflict: 'dominio' });
      if (error) throw new Error('apollo_domini_titolari: ' + error.message);
    }
    // domini che non sono piu' condivisi (es. una scheda fusa): via dalla tabella
    const attuali = new Set(righe.map((r) => r.dominio));
    const { data: vecchi } = await supabase.from('apollo_domini_titolari').select('dominio');
    const daTogliere = (vecchi || []).map((r) => r.dominio).filter((d) => !attuali.has(d));
    for (let i = 0; i < daTogliere.length; i += 100) {
      await supabase.from('apollo_domini_titolari').delete().in('dominio', daTogliere.slice(i, i + 100));
    }
  }
  return { titolari, nonTitolari, righe };
}

/**
 * Toglie da company_workforce l'organico delle schede non titolari: e' la
 * copia della lista del titolare (o di un gruppo che non e' in anagrafica).
 * Le persone restano in apollo_people_raw, visibili nella card archivio.
 */
export async function togliOrganicoNonTitolari(supabase, nonTitolari) {
  const ids = [...nonTitolari];
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supabase.from('company_workforce').delete().in('company_id', ids.slice(i, i + 100));
    if (error) throw new Error('company_workforce (non titolari): ' + error.message);
  }
  return ids.length;
}
