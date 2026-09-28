/**
 * IMPORTA UNO SCARICO APOLLO LOCALE NELL'ARCHIVIO (28/09/2026)
 * =============================================================================
 *   node scripts/apollo-importa-scarico-locale.mjs <file.ndjson>          misura
 *   node scripts/apollo-importa-scarico-locale.mjs <file.ndjson> --apply  scrive
 *
 * Il file (una riga per azienda: company_id, dominio, total_entries, pagine,
 * people[], esito, fine_naturale) e' quello prodotto dalla diagnosi del 28/09,
 * che ha scaricato tutta la ricerca persone senza scrivere sul database. Qui
 * lo si porta in apollo_people_raw / apollo_people_scarico / apollo_campi_visti
 * cosi' com'e', senza rifare nessuna chiamata Apollo.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import readline from 'node:readline';
import { creaArchivio } from './lib/apollo-archivio.mjs';
dotenv.config();

const FILE = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!FILE || !fs.existsSync(FILE)) { console.error('uso: node scripts/apollo-importa-scarico-locale.mjs <file.ndjson> [--apply]'); process.exit(1); }

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const arc = creaArchivio(supabase, null, { scrivi: APPLY, pausaMs: 0 });

const attive = new Set();
for (let da = 0; ; da += 1000) {
  const { data, error } = await supabase.from('companies').select('id').order('id').range(da, da + 999);
  if (error) throw new Error(error.message);
  data.forEach((c) => attive.add(c.id));
  if (data.length < 1000) break;
}

const conta = { aziende: 0, persone: 0, completo: 0, zero_risultati: 0, errore: 0, saltate: 0 };
const rl = readline.createInterface({ input: fs.createReadStream(FILE, 'utf8'), crlfDelay: Infinity });
for await (const linea of rl) {
  if (!linea.trim()) continue;
  const r = JSON.parse(linea);
  if (!r.dominio || !attive.has(r.company_id)) { conta.saltate++; continue; }
  conta.aziende++;
  arc.inventaria('mixed_people/api_search', { total_entries: r.total_entries, people: r.people });
  const esito = r.esito === 'errore' ? 'errore' : !r.people.length ? 'zero_risultati' : r.fine_naturale ? 'completo' : 'in_corso';
  conta[esito === 'in_corso' ? 'errore' : esito]++;
  conta.persone += r.people.length;
  if (!APPLY) continue;
  await arc.salvaPersone(r.company_id, r.people);
  await arc.aggiornaScarico({
    company_id: r.company_id, dominio: r.dominio, total_entries: r.total_entries,
    scaricate: r.people.length, pagine: r.pagine, completo: esito === 'completo' || esito === 'zero_risultati',
    esito, errore: r.errore || null,
  });
  if (conta.aziende % 100 === 0) console.log(`  ${conta.aziende} aziende · ${conta.persone} persone`);
}
const inv = await arc.chiudi();
if (APPLY) {
  const { error } = await supabase.rpc('apollo_rinfresca_riepiloghi');
  if (error) console.error('riepiloghi front-end NON rinfrescati:', error.message);
}
console.log(`\n${APPLY ? 'IMPORTATO' : 'MISURA'}:`, conta, '· percorsi di campo:', inv.campi);
process.exit(0);
