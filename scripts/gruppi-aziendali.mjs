/**
 * GRUPPI AZIENDALI · Bayer, Menarini, GSK... (proposta automatica per nome)
 * =============================================================================
 *   node scripts/gruppi-aziendali.mjs               misura, mostra la proposta
 *   node scripts/gruppi-aziendali.mjs --apply        crea i gruppi confermati
 *
 * A differenza dei merge fatti finora (stessa azienda, nomi diversi — fuse in
 * una sola riga), qui le aziende restano SEPARATE: "Bayer Italia SpA" e
 * "Bayer AG" sono entita' legali diverse con annunci/settore/prodotti propri,
 * ma la stessa famiglia — vengono collegate a una company_groups comune, non
 * fuse. Vedi db/PARTE_16_company_groups.sql.
 *
 * PROPOSTA: raggruppa per il primo token non generico del nome normalizzato
 * (stessa normalizzazione aggressiva usata per AIFA/dispositivi medici — strips
 * forma societaria, parole di settore, nomi di paese). "A. Menarini Diagnostics
 * S.r.l." e "Menarini Biotech S.r.l." normalizzano entrambe a un nome che
 * comincia con "menarini" -> stesso gruppo proposto.
 *
 * SOLO PROPOSTA: --apply crea i gruppi SOLO per le chiavi elencate in
 * CHIAVI_CONFERMATE qui sotto (vuoto finche' non revisioniamo l'elenco
 * insieme) — mai un "crea tutto quello che trovi" automatico, esattamente
 * come per i merge Roche/Lama/Synlab di questa stessa sessione.
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

// Stessa normalizzazione ormai condivisa (per convenzione, non per import) da
// aifa-registro-prodotti.mjs / dispositivi-medici-registro.mjs / officine-api-principi-attivi.mjs.
const FORME_SPAZIATE = /\b(s r l|s p a|s a s|s n c|b v|n v|a g|s a|l l c)\b/g;
const RUMORE = /\b(spa|srl|sas|snc|societa|italia|italy|group|holding|inc|ltd|limited|llc|gmbh|bvba|plc|co|corp|corporation|company|pharmaceuticals?|pharma|therapeutics?|biosciences?|biotech|biotec|sciences?|labs?|laboratories|and|the|nederland|deutschland|france|espana|europe|medical|meditech|healthcare|ireland|republic|uk|usa|canada|china|korea|japan|switzerland|sweden|norway|finland|poland|belgium|austria|netherlands|spain|portugal|brazil|mexico|india|singapore|australia|denmark|nordic|chimica|chimico|farmaceutica|farmaceutico|molecular|linea|partners)\b/g;

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
  'istituto', 'laboratorio', 'consorzio', 'centro', 'azienda', 'aziende', 'italiana', 'italiano',
  // trovate rilanciando il raggruppamento su TUTTA l'anagrafica (2.276 aziende,
  // non solo le ~150 senza sito): parole di categoria del settore sanitario/
  // farmaceutico italiano, condivise da decine di strutture indipendenti e
  // scorrelate (farmacie, cliniche, case di cura) — non sono famiglie di
  // gruppo, sono lo stesso tipo di esercizio commerciale.
  'farmacia', 'farmacie', 'clinica', 'clinico', 'villa', 'casa', 'fondazione',
  'medico', 'medici', 'diagnostico', 'diagnostica', 'policlinico', 'poliambulatorio',
  'medicina', 'croce', 'ricerche', 'ricerca', 'cosmetic', 'cosmetici', 'cosmesi',
  'dental', 'general', 'nova', 'nuova', 'sanitas', 'hospital', 'clinics', 'salute', 'ospedale',
  'cura', 'citta', 'santa', 'sant', 'carlo', 'francesco', 'giovanni', 'prodotti',
  'alliance', 'consulting', 'data', 'anni', 'ossigeno', 'beauty', 'igea',
]);

// Primo token non generico del nome normalizzato: e' il segnale di gruppo
// (il brand compare quasi sempre per primo — "Bayer Consumer Health",
// "Bayer AG", "Menarini Diagnostics" — con l'eccezione nota "A. Menarini..."
// dove "a" e' gia' troppo corto per essere un token).
function chiaveGruppo(nomeNorm) {
  const token = nomeNorm.split(' ').filter((t) => t.length >= 4 && !CATEGORIA_GENERICA.has(t));
  return token[0] || null;
}

// Revisione manuale completa dei 134 gruppi proposti (07/09/2026, confermata
// da Mauro): questi 39 sono famiglie reali con piu' entita' legali diverse.
// Tutto il resto scartato: o rumore (nomi di persona/luogo comuni fra
// strutture sanitarie scorrelate — "Carlo", "Villa Serena", "Santa Maria"...)
// o duplicati della STESSA azienda scritta due volte (da fondere con
// merged_into, non da raggruppare — vedi la lista separata data all'utente).
const CHIAVI_CONFERMATE = new Set([
  'fresenius', 'menarini', 'glaxosmithkline', 'advanced', 'iqvia', 'humanitas',
  'johnson', 'molteni', 'piam', 'bayer', 'errekappa', 'roche', 'braun', 'bristol',
  'cheplapharm', 'stallergenes', 'swedish', 'dentsply', 'hikma', 'ascendis',
  'mylan', 'immedica', 'holostem', 'bracco', 'mindray', 'tecnimede', 'atnahs',
  'helsinn', 'terumo', 'valpharma', 'merck', 'vifor', 'beone', 'huvepharma',
  'biosimilar', 'cerba', 'chromavis', 'basf', 'zoetis',
]);

// "Advanced" agganciava anche ADVANCED BIONICS ITALIA S.R.L. (impianti
// cocleari — marchio scorrelato da Advanced Accelerator Applications):
// esclusa esplicitamente prima di creare il gruppo.
const ESCLUSIONI_MEMBRI = new Map([
  ['advanced', new Set(['ADVANCED BIONICS ITALIA S.R.L.'])],
]);

async function runGruppiAziendaliDailyBatch(apply = CLI_APPLY) {
  const log = [];
  const push = (m) => { console.log(m); log.push(String(m).replace(/\x1b\[[0-9]+m/g, '')); };
  push(`\n${B}Gruppi aziendali (proposta per nome)${Z} ${D}${apply ? 'CREA (solo chiavi confermate)' : 'solo misura'} · costo 0,00 $${Z}`);

  const aziende = await sb('companies?select=id,name,company_group_id&is_active=eq.true&merged_into=is.null&limit=4000');
  const senzaGruppo = aziende.filter((c) => !c.company_group_id);
  push(`${D}Aziende attive senza gruppo: ${senzaGruppo.length}${Z}`);

  const perChiave = new Map();
  for (const c of senzaGruppo) {
    const chiave = chiaveGruppo(norm(c.name));
    if (!chiave) continue;
    if (!perChiave.has(chiave)) perChiave.set(chiave, []);
    perChiave.get(chiave).push(c);
  }

  const proposte = [...perChiave.entries()].filter(([, membri]) => membri.length >= 2).sort((a, b) => b[1].length - a[1].length);

  push(`\n${'─'.repeat(80)}`);
  push(`  ${G}gruppi proposti (>=2 aziende con lo stesso token guida) ... ${proposte.length}${Z}`);
  push(`  aziende coinvolte totali .............................. ${proposte.reduce((s, [, m]) => s + m.length, 0)}`);

  push(`\n  ${D}Proposta completa (rivedi prima di confermare):${Z}`);
  for (const [chiave, membri] of proposte) {
    push(`\n  ${B}"${chiave}"${Z} (${membri.length} aziende)${chiave && CHIAVI_CONFERMATE.has(chiave) ? ` ${G}[confermata]${Z}` : ''}`);
    for (const m of membri) push(`    - ${m.name}`);
  }

  const summary = { aziendeSenzaGruppo: senzaGruppo.length, gruppiProposti: proposte.length, gruppiCreati: 0, aziendeAssegnate: 0 };

  if (!apply) {
    push(`\n  ${Y}misura soltanto: nulla scritto. Aggiungi le chiavi da confermare a CHIAVI_CONFERMATE e rilancia con --apply.${Z}\n`);
    return { summary, log };
  }

  const daCreare = proposte.filter(([chiave]) => CHIAVI_CONFERMATE.has(chiave));
  if (!daCreare.length) {
    push(`\n  ${Y}CHIAVI_CONFERMATE e' vuoto: nessun gruppo da creare.${Z}\n`);
    return { summary, log };
  }

  let gruppiCreati = 0, aziendeAssegnate = 0;
  for (const [chiave, membriGrezzi] of daCreare) {
    const esclusi = ESCLUSIONI_MEMBRI.get(chiave);
    const membri = esclusi ? membriGrezzi.filter((m) => !esclusi.has(m.name)) : membriGrezzi;
    if (membri.length < 2) { push(`${Y}  "${chiave}" scartato: meno di 2 aziende dopo le esclusioni${Z}`); continue; }
    const nomeGruppo = chiave.charAt(0).toUpperCase() + chiave.slice(1);
    const [gruppo] = await sb('company_groups', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify([{ name: nomeGruppo }]) });
    gruppiCreati++;
    for (const m of membri) {
      await sb(`companies?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ company_group_id: gruppo.id }) });
      aziendeAssegnate++;
    }
    const notaEsclusi = esclusi && esclusi.size ? ` (${esclusi.size} escluse: ${[...esclusi].join(', ')})` : '';
    push(`${G}  creato gruppo "${nomeGruppo}" con ${membri.length} aziende${notaEsclusi}${Z}`);
  }

  summary.gruppiCreati = gruppiCreati;
  summary.aziendeAssegnate = aziendeAssegnate;
  push(`\n  ${G}creati ${gruppiCreati} gruppi, ${aziendeAssegnate} aziende assegnate${Z}\n`);
  return { summary, log };
}

export { runGruppiAziendaliDailyBatch };

const isCLI = process.argv[1] && process.argv[1].includes('gruppi-aziendali.mjs');
if (isCLI) {
  runGruppiAziendaliDailyBatch().catch((e) => {
    console.error('❌ ERRORE TOP-LEVEL:', e.message);
    process.exit(1);
  });
}
