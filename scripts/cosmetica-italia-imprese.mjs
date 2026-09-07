/**
 * COSMESI · Imprese associate Cosmetica Italia
 * =============================================================================
 *   node scripts/cosmetica-italia-imprese.mjs               misura, non scrive
 *   node scripts/cosmetica-italia-imprese.mjs --apply       scrive
 *
 * COSTO: ZERO — API pubblica dietro la pagina "Imprese associate" del sito
 * di Cosmetica Italia (l'associazione di categoria, ~650 aziende dalla
 * multinazionale alla PMI), nessuna chiamata AI.
 *
 * PERCHE' QUESTA FONTE: in Italia NON esiste un registro pubblico dei
 * prodotti cosmetici (i produttori notificano il sito al Ministero via PEC,
 * non pubblicato; il portale europeo CPNP che raccoglie i singoli prodotti è
 * ad accesso riservato alle autorità, non consultabile). Le imprese associate
 * a Cosmetica Italia sono il miglior proxy pubblico disponibile per "chi fa
 * cosmesi in Italia" — non un elenco di prodotti, ma un'anagrafica di
 * aziende reali e verificate (l'adesione all'associazione di categoria non è
 * banale).
 *
 * NON prodotti in company_products (qui non abbiamo nomi di prodotto, solo
 * aziende): scrive/completa solo settore e sito web delle aziende, SOLO dove
 * il campo è vuoto — mai sovrascritto un dato già presente.
 *
 * ABBINAMENTO: P.IVA esatta anzitutto (qui il 100% delle imprese la riporta —
 * molto più affidabile del nome), poi la stessa logica nome esatto/per
 * contenimento degli altri registri di questa sessione. Nessuna creazione
 * automatica di aziende nuove: sono ~600 aziende reali, ma questo script fa
 * SOLO la misura + il completamento; la creazione, se voluta, è una scelta
 * separata da confermare dopo aver visto quante sarebbero.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config();

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const G = '\x1b[32m', Y = '\x1b[33m', D = '\x1b[2m', B = '\x1b[1m', Z = '\x1b[0m';
const CLI_APPLY = process.argv.includes('--apply');

const envFile = (n) => (readFileSync(join(ROOT, '.env'), 'utf8').match(new RegExp('^\\s*' + n + '=(.*)$', 'm')) || [])[1]?.trim();
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || envFile('SUPABASE_SERVICE_ROLE_KEY');
const SB = (process.env.SUPABASE_URL || envFile('SUPABASE_URL') || '').replace(/\/+$/, '') + '/rest/v1';

async function sb(path, init = {}) {
  const r = await fetch(`${SB}/${path}`, { ...init, headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

const FORME_SPAZIATE = /\b(s r l|s p a|s a s|s n c|b v|n v|a g|s a|l l c)\b/g;
const RUMORE = /\b(spa|srl|sas|snc|societa|italia|italy|group|holding|inc|ltd|limited|llc|gmbh|bvba|plc|co|corp|corporation|company|pharmaceuticals?|pharma|therapeutics?|biosciences?|biotech|biotec|sciences?|labs?|laboratories|and|the|nederland|deutschland|france|espana|europe|medical|meditech|healthcare|ireland|republic|uk|usa|canada|china|korea|japan|switzerland|sweden|norway|finland|poland|belgium|austria|netherlands|spain|portugal|brazil|mexico|india|singapore|australia|denmark|nordic|chimica|chimico|farmaceutica|farmaceutico|molecular|linea|partners|soc agricola|societa agricola)\b/g;

const norm = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(FORME_SPAZIATE, ' ')
  .replace(RUMORE, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function tokenSet(nomeNorm) {
  return new Set(nomeNorm.split(' ').filter((t) => t.length >= 4));
}

const CATEGORIA_GENERICA = new Set([
  'pharm', 'pharma', 'pharmac', 'farma', 'farmaceutici', 'research', 'solutions', 'soluzioni',
  'international', 'life', 'health', 'medical', 'care', 'laboratoires', 'laboratoire', 'laboratori',
  'diagnostics', 'service', 'services', 'euro', 'med', 'industrie', 'industries',
  'device', 'devices', 'surgical', 'system', 'systems', 'group', 'gruppo', 'technology', 'technologies',
  'instrument', 'instruments', 'vision', 'factory', 'biomedica', 'biomed', 'biomedical',
  'medi', 'medic', 'project', 'line', 'master', 'biologics', 'hearing', 'zero', 'bone',
  'process', 'studio', 'ingegneria', 'engineering', 'global', 'trade', 'concept',
  'green', 'delta', 'omega', 'phoenix', 'optima', 'evolution', 'feel', 'beyond',
  'wave', 'medicare', 'innova', 'applied', 'raffaele', 'imaging', 'industria', 'industriale',
  'cosmetics', 'cosmetici', 'cosmetic', 'cosmesi', 'italia', 'beauty', 'perfumes', 'profumi',
  'farmacia', 'farmacie', 'milano', 'roma', 'torino', 'napoli', 'bologna', 'firenze', 'genova',
]);

const soloCifre = (s) => (s || '').replace(/\D/g, '');

async function listaImpreseCosmeticaItalia() {
  const res = await fetch('https://www.cosmeticaitalia.it/cosmeticaws/jsp/json.jsp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'listaImprese', params: {}, id: 1 }),
  });
  if (!res.ok) throw new Error(`Cosmetica Italia: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`Cosmetica Italia: ${json.error.message}`);
  return json.result;
}

function normalizzaSito(w) {
  if (!w) return null;
  const t = w.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : 'https://' + t.replace(/^\/+/, '');
}

async function runCosmeticaItaliaDailyBatch(apply = CLI_APPLY) {
  const log = [];
  const push = (m) => { console.log(m); log.push(String(m).replace(/\x1b\[[0-9]+m/g, '')); };
  push(`\n${B}Cosmesi — Imprese associate Cosmetica Italia${Z} ${D}${apply ? 'SCRIVE (solo campi vuoti)' : 'solo misura'} · costo 0,00 $${Z}`);

  const aziende = await sb('companies?select=id,name,is_active,merged_into,iva,sector_v2,website&limit=4000');
  const attive = aziende.filter((c) => c.is_active && !c.merged_into);

  const perIvaTutti = new Map();
  for (const c of attive) { const cifre = soloCifre(c.iva); if (cifre.length < 8) continue; if (!perIvaTutti.has(cifre)) perIvaTutti.set(cifre, []); perIvaTutti.get(cifre).push(c); }
  const perIva = new Map();
  for (const [k, gruppo] of perIvaTutti) if (gruppo.length === 1) perIva.set(k, gruppo[0]);

  const perNomeTutti = new Map();
  for (const c of attive) { const n = norm(c.name); if (!n) continue; if (!perNomeTutti.has(n)) perNomeTutti.set(n, []); perNomeTutti.get(n).push(c); }
  const perNome = new Map();
  for (const [n, gruppo] of perNomeTutti) if (gruppo.length === 1) perNome.set(n, gruppo[0]);
  const conToken = attive.map((c) => ({ c, tokens: tokenSet(norm(c.name)) })).filter((x) => x.tokens.size > 0);

  function accoppiaEsatto(nome) {
    const n = norm(nome);
    if (!n || n.length < 3) return null;
    return perNome.get(n) || null;
  }
  function accoppiaPerContenimento(nome) {
    const tokensEstero = tokenSet(norm(nome));
    if (!tokensEstero.size) return null;
    const candidati = conToken.filter(({ tokens }) => {
      if (tokens.size === 1 && CATEGORIA_GENERICA.has([...tokens][0])) return false;
      return [...tokens].every((t) => tokensEstero.has(t));
    });
    return candidati.length === 1 ? candidati[0].c : null;
  }

  push(`${D}Scarico l'elenco imprese associate...${Z}`);
  const imprese = await listaImpreseCosmeticaItalia();
  push(`${D}  ${imprese.length} imprese associate${Z}`);

  let viaIva = 0, viaEsatto = 0, viaContenimento = 0;
  const matchPerContenimento = [];
  const orfani = [];
  const daAggiornare = []; // {companyId, patch}

  for (const impresa of imprese) {
    const cifrePiva = soloCifre(impresa.partitaIva);
    let azienda = (cifrePiva && perIva.get(cifrePiva)) || null;
    let via = azienda ? 'iva' : null;
    if (!azienda) { azienda = accoppiaEsatto(impresa.ragioneSociale); if (azienda) via = 'esatto'; }
    if (!azienda) { azienda = accoppiaPerContenimento(impresa.ragioneSociale); if (azienda) { via = 'contenimento'; matchPerContenimento.push({ nome: impresa.ragioneSociale, azienda: azienda.name }); } }

    if (!azienda) { orfani.push(impresa); continue; }
    if (via === 'iva') viaIva++; else if (via === 'esatto') viaEsatto++; else viaContenimento++;

    const patch = {};
    if (!azienda.sector_v2) patch.sector_v2 = 'Cosmetics';
    const sitoNorm = normalizzaSito(impresa.webSite);
    if (!azienda.website && sitoNorm) patch.website = sitoNorm;
    if (Object.keys(patch).length) daAggiornare.push({ companyId: azienda.id, nome: azienda.name, patch });
  }

  push(`\n${'─'.repeat(80)}`);
  push(`  imprese associate lette ................. ${imprese.length}`);
  push(`  ${G}aziende collegate ....................... ${viaIva + viaEsatto + viaContenimento}${Z} ${D}(${viaIva} per P.IVA, ${viaEsatto} per nome esatto, ${viaContenimento} per nome simile)${Z}`);
  push(`  ${Y}imprese senza azienda corrispondente ..... ${orfani.length}${Z} ${D}(NON create automaticamente)${Z}`);
  push(`  ${G}aziende con almeno un campo da completare  ${daAggiornare.length}${Z}`);

  if (matchPerContenimento.length) {
    push(`\n  ${D}Esempi di abbinamento per nome simile:${Z}`);
    for (const m of matchPerContenimento.slice(0, 20)) push(`    "${m.nome}" -> "${m.azienda}"`);
  }
  if (orfani.length) {
    push(`\n  ${D}Imprese associate orfane più significative (con sito, quindi verificabili):${Z}`);
    for (const o of orfani.filter((o) => o.webSite).slice(0, 20)) push(`    ${o.ragioneSociale} — ${o.webSite} (${o.indirizzi?.SL?.siglaProvincia || '?'})`);
  }

  const summary = { impreseLette: imprese.length, aziendeCollegate: viaIva + viaEsatto + viaContenimento, impreseOrfane: orfani.length, aziendeDaAggiornare: daAggiornare.length, aziendeAggiornate: 0 };

  if (!apply) {
    push(`\n  ${Y}misura soltanto: nulla scritto. Rilancia con --apply.${Z}\n`);
    return { summary, log };
  }

  const logLotti = (m) => push(`${D}  ${m}${Z}`);
  let aggiornate = 0;
  for (const { companyId, nome, patch } of daAggiornare) {
    try {
      await sb(`companies?id=eq.${companyId}`, { method: 'PATCH', body: JSON.stringify(patch) });
      aggiornate++;
    } catch (e) {
      logLotti(`errore su ${nome}: ${e.message.slice(0, 80)}`);
    }
  }
  summary.aziendeAggiornate = aggiornate;
  push(`\n  ${G}aggiornate ${aggiornate} aziende (settore e/o sito, solo campi vuoti)${Z}\n`);
  return { summary, log };
}

export { runCosmeticaItaliaDailyBatch };

const isCLI = process.argv[1] && process.argv[1].includes('cosmetica-italia-imprese.mjs');
if (isCLI) {
  runCosmeticaItaliaDailyBatch().catch((e) => {
    console.error('❌ ERRORE TOP-LEVEL:', e.message);
    process.exit(1);
  });
}
