/**
 * GRUPPI CON CAPOGRUPPO — a quale societa' va ogni persona (28/09/2026)
 * =============================================================================
 * Regola decisa da Mauro su Fresenius ("segui questa logica"), valida per ogni
 * gruppo di company_groups con capogruppo_id:
 *   - le persone scaricate per TUTTE le societa' del gruppo formano un'unica
 *     lista (ognuna contata una volta)
 *   - ogni persona va alla societa' del gruppo il cui nome corrisponde meglio
 *     all'organizzazione Apollo della persona (punteggioNome, lo stesso dei
 *     domini condivisi): "Fresenius Kabi" -> Fresenius Kabi
 *   - a parita', o se nessuna corrisponde, va alla capogruppo
 *     ("Fresenius Medical Care" -> Fresenius Italia, non alla scheda
 *     "Fresenius medical care", che resta senza dipendenti)
 * La capogruppo mostra poi l'intero numero del gruppo (v_fe_gruppo_organico).
 *
 * Il gruppo vince sui domini condivisi: i suoi membri escono da quella regola.
 */
import { punteggioNome } from './apollo-domini.mjs';
import { rigaWorkforce } from './organico-tassonomia.mjs';

async function leggiTutte(supabase, nome, query, pagina = 1000) {
  const righe = [];
  for (let da = 0; ; da += pagina) {
    const { data, error } = await query().range(da, da + pagina - 1);
    if (error) throw new Error(`lettura ${nome} fallita: ${error.message}`);
    righe.push(...(data || []));
    if (!data || data.length < pagina) return righe;
  }
}

/** Membri dei gruppi con capogruppo: Map(company_id -> { gruppoId, capogruppoId }). */
export async function membriDiGruppo(supabase) {
  const gruppi = await leggiTutte(supabase, 'company_groups', () =>
    supabase.from('company_groups').select('id,name,capogruppo_id').not('capogruppo_id', 'is', null).order('id'));
  const membri = new Map();
  for (let i = 0; i < gruppi.length; i += 100) {
    const lotto = gruppi.slice(i, i + 100);
    const { data, error } = await supabase.from('companies').select('id,company_group_id')
      .in('company_group_id', lotto.map((g) => g.id)).eq('is_active', true).is('merged_into', null);
    if (error) throw new Error('companies (membri): ' + error.message);
    for (const c of data) {
      const g = lotto.find((x) => x.id === c.company_group_id);
      membri.set(c.id, { gruppoId: g.id, capogruppoId: g.capogruppo_id });
    }
  }
  return { gruppi, membri };
}

/**
 * Ricalcola l'attribuzione di tutti i gruppi con capogruppo (o solo di quelli
 * indicati) e, con scrivi=true, la registra e ricostruisce company_workforce
 * dei membri. Ritorna { membri: Set, perSocieta: Map(company_id -> persone), righe }.
 */
export async function ricostruisciGruppi(supabase, { scrivi = true, soloGruppi = null } = {}) {
  const { gruppi: tutti } = await membriDiGruppo(supabase);
  const gruppi = soloGruppi ? tutti.filter((g) => soloGruppi.has(g.id)) : tutti;
  const orgNome = new Map((await leggiTutte(supabase, 'apollo_people_org', () =>
    supabase.from('apollo_people_org').select('impronta,nome').order('impronta'))).map((o) => [o.impronta, o.nome]));

  const membriTutti = new Set();
  const perSocieta = new Map();
  let righeTot = 0;
  for (const g of gruppi) {
    const { data: societa, error } = await supabase.from('companies')
      .select('id,name,sector_v2,arricchito_il,created_at').eq('company_group_id', g.id).eq('is_active', true).is('merged_into', null);
    if (error) throw new Error('companies (gruppo): ' + error.message);
    if (!societa.some((s) => s.id === g.capogruppo_id)) continue; // capogruppo fusa o disattivata: non si decide al buio
    societa.forEach((s) => { membriTutti.add(s.id); perSocieta.set(s.id, []); });

    const persone = await leggiTutte(supabase, 'apollo_people_raw', () => supabase.from('apollo_people_raw')
      .select('company_id,apollo_person_id,title,org_impronta,ultimo_visto_il')
      .in('company_id', societa.map((s) => s.id)).order('company_id').order('apollo_person_id'));

    // Una persona, una riga: se piu' societa' l'hanno scaricata, vale la vista piu' recente.
    const uniche = new Map();
    for (const p of persone) {
      const prima = uniche.get(p.apollo_person_id);
      if (!prima || Date.parse(p.ultimo_visto_il) > Date.parse(prima.ultimo_visto_il)) uniche.set(p.apollo_person_id, p);
    }

    const recente = (s) => Math.max(Date.parse(s.arricchito_il || 0) || 0, Date.parse(s.created_at || 0) || 0);
    const cacheOrg = new Map();
    const attribuzione = [];
    for (const p of uniche.values()) {
      const org = orgNome.get(p.org_impronta) ?? null;
      if (!cacheOrg.has(org)) {
        const classifica = societa
          .map((s) => ({ s, punti: org ? punteggioNome(s.name, org) : 0 }))
          .sort((a, b) => b.punti - a.punti || (b.s.id === g.capogruppo_id) - (a.s.id === g.capogruppo_id) || recente(b.s) - recente(a.s));
        const migliore = classifica[0];
        const pari = migliore.punti > 0 && classifica.some((x) => x.s.id === g.capogruppo_id && x.punti === migliore.punti);
        cacheOrg.set(org, migliore.punti > 0 && !pari ? migliore.s : societa.find((s) => s.id === g.capogruppo_id));
      }
      const proprietario = cacheOrg.get(org);
      perSocieta.get(proprietario.id).push({ ...p, settoreProprietario: proprietario.sector_v2 });
      attribuzione.push({ gruppo_id: g.id, apollo_person_id: p.apollo_person_id, proprietario_id: proprietario.id, fonte_company_id: p.company_id, org_nome: org });
    }
    righeTot += attribuzione.length;

    if (!scrivi) continue;
    const { error: eDel } = await supabase.from('apollo_gruppo_attribuzione').delete().eq('gruppo_id', g.id);
    if (eDel) throw new Error('apollo_gruppo_attribuzione delete: ' + eDel.message);
    for (let i = 0; i < attribuzione.length; i += 500) {
      const { error: eIns } = await supabase.from('apollo_gruppo_attribuzione').insert(attribuzione.slice(i, i + 500));
      if (eIns) throw new Error('apollo_gruppo_attribuzione insert: ' + eIns.message);
    }
    for (const s of societa) {
      const righe = perSocieta.get(s.id).map((p) => rigaWorkforce(s.id, p, p.settoreProprietario)).filter(Boolean);
      const { error: eW } = await supabase.from('company_workforce').delete().eq('company_id', s.id);
      if (eW) throw new Error('company_workforce delete: ' + eW.message);
      for (let i = 0; i < righe.length; i += 500) {
        const { error: eI } = await supabase.from('company_workforce').insert(righe.slice(i, i + 500));
        if (eI) throw new Error('company_workforce insert: ' + eI.message);
      }
    }
  }
  return { membri: membriTutti, perSocieta, righe: righeTot, gruppi: gruppi.length };
}
