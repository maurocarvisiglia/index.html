/**
 * SOFTHIRING · SINCRONIZZAZIONE CRM · aziende con nominativo+mail
 * =============================================================================
 *   node scripts/softhiring-sync.mjs 3               misura le prime 3 (nessuna scrittura su SoftHiring)
 *   node scripts/softhiring-sync.mjs 3 --apply        scrive davvero
 *   node scripts/softhiring-sync.mjs --apply           tutte le aziende idonee
 *
 * COSA IMPORTA (richiesto da Mauro, 23/09/2026): per ogni azienda di LS Job
 * Intelligence che ha ALMENO un contatto con nome vero + email (stessa soglia
 * del pannello "Contatti + mail" nella schermata Aziende, 1.432 aziende al
 * 23/09/2026):
 *   1. un Account SoftHiring (nome, P.IVA se nota, descrizione aziendale)
 *   2. tutti i contatti reali dell'azienda (non solo quello con l'email), come
 *      Contact SoftHiring collegati a quell'Account
 *
 * NOTE SUL CAMPO "notes" DELL'ACCOUNT — la guida API mostra "notes" solo per
 * le Activity, non per gli Account. Non si assume che esista: il PRIMO test
 * reale (--apply su 1 azienda) verifica cosa succede passandolo comunque:
 *   - se l'Account creato lo conserva -> resta cosi'
 *   - se l'API lo ignora silenziosamente o restituisce errore -> va sostituito
 *     con una Activity di tipo "nota" collegata all'account (TODO se serve)
 *
 * ANTI-DUPLICATI — usa companies.softhiring_account_id (migration 23/09/2026):
 * un'azienda con questo campo gia' valorizzato NON viene ricreata; si aggiungono
 * solo i contatti eventualmente nuovi su quell'account. Se l'azienda non ha
 * ancora un id, si controlla comunque il nome contro GET /accounts prima di
 * creare (SoftHiring risponde 409 su nome duplicato: se il nome esiste gia' -
 * magari creato a mano da Mauro - si riusa quell'id invece di fallire).
 *
 * COSTO: nessuno (API propria di SoftHiring, incluso nel piano) — ma sono
 * scritture su un CRM live che il team usa: stessa disciplina misura/scrivi
 * di tutta la famiglia di script di oggi, mai un batch grande senza prima un
 * test piccolo.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', D = '\x1b[2m', B = '\x1b[1m', Z = '\x1b[0m';

const APPLY = process.argv.includes('--apply');
const argLimite = process.argv.find((a) => /^\d+$/.test(a));
const LIMITE = argLimite === undefined ? 9999 : Number(argLimite);

const env = (n) => (readFileSync(join(ROOT, '.env'), 'utf8').match(new RegExp('^\\s*' + n + '=(.*)$', 'm')) || [])[1]?.trim();
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const ANON = html.match(/eyJhbGciOiJIUzI1NiIs[A-Za-z0-9_.-]{40,}/)[0];
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const SB = (env('SUPABASE_URL') || '').replace(/\/+$/, '') + '/rest/v1';
const SH_KEY = env('SOFTHIRING_API_KEY');
const SH_BASE = 'https://dashboard.softhiring.jobs/api/public/crm';

if (APPLY && !SH_KEY) throw new Error('SOFTHIRING_API_KEY mancante in .env — nessuna scrittura possibile senza chiave reale.');

async function sb(path, init = {}) {
  const k = init.method && init.method !== 'GET' ? SERVICE : ANON;
  const r = await fetch(`${SB}/${path}`, { ...init, headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`Supabase HTTP ${r.status} ${path}: ${(await r.text()).slice(0, 160)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

async function sh(path, method = 'GET', body) {
  const r = await fetch(`${SH_BASE}${path}`, {
    method, headers: { Authorization: `Bearer ${SH_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const testo = await r.text();
  const dati = testo ? JSON.parse(testo) : null;
  if (!r.ok) {
    const err = new Error(dati?.message || `SoftHiring HTTP ${r.status}`);
    err.status = r.status; err.body = dati;
    throw err;
  }
  return dati;
}

// ─────────────────────────────────────────────────────────────────────────────
// SELEZIONE AZIENDE — stessa soglia "Contatti + mail" del pannello aziende:
// almeno un contatto con nome vero (non il placeholder) e email.
// ─────────────────────────────────────────────────────────────────────────────
async function apiPaginato(path, pageSize = 5000) {
  let risultati = [], offset = 0;
  const sep = path.includes('?') ? '&' : '?';
  while (true) {
    const pagina = await sb(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    risultati.push(...pagina);
    if (pagina.length < pageSize) break;
    offset += pageSize;
  }
  return risultati;
}

const TITOLI_DECISION_MAKER = /\bhr\b|human resources|talent acquisition|responsabile hr|risorse umane|\bceo\b|chief executive|amministratore delegato|general manager|direttore generale|managing director|founder|owner/i;

function splitNome(nomeCompleto) {
  const parti = String(nomeCompleto).trim().split(/\s+/);
  if (parti.length === 1) return { firstName: parti[0], lastName: '' };
  return { firstName: parti[0], lastName: parti.slice(1).join(' ') };
}

console.log(`\n${B}SoftHiring · sincronizzazione CRM${Z}`);
console.log(`${D}${APPLY ? 'SCRIVE su SoftHiring' : 'solo misura, nessuna chiamata a SoftHiring'}${Z}\n`);

const [companies, contatti] = await Promise.all([
  sb('companies?select=id,name,ragione_sociale,iva,descrizione_aziendale,softhiring_account_id&is_active=eq.true&merged_into=is.null'),
  apiPaginato('company_contacts?select=id,company_id,nome,ruolo,email,telefono'),
]);

const contattiPerAzienda = new Map();
for (const c of contatti) {
  if (!c.nome || c.nome === '(contatto senza nome)') continue;
  if (!contattiPerAzienda.has(c.company_id)) contattiPerAzienda.set(c.company_id, []);
  contattiPerAzienda.get(c.company_id).push(c);
}

// Idonea = almeno un contatto reale CON email (soglia "Contatti + mail").
const idonee = companies.filter((c) => (contattiPerAzienda.get(c.id) || []).some((x) => x.email));
console.log(`${D}aziende idonee (nominativo+mail): ${idonee.length} · in questa corsa: ${Math.min(idonee.length, LIMITE)}${Z}\n`);

const campione = idonee.slice(0, LIMITE);

let accountCreati = 0, accountRiusati = 0, contattiCreati = 0, contattiEsistenti = 0, errori = 0;

for (const az of campione) {
  process.stdout.write(`${D}▸${Z} ${az.name.slice(0, 40).padEnd(42)}`);
  try {
    let accountId = az.softhiring_account_id;
    let appenaCreato = false;

    if (!accountId) {
      if (!APPLY) {
        console.log(`${Y}creerebbe Account${az.descrizione_aziendale ? ' + note' : ''}${Z}`);
        continue;
      }
      const payload = { name: az.name };
      if (az.iva) payload.vatNumber = az.iva;
      if (az.descrizione_aziendale) payload.notes = az.descrizione_aziendale;

      try {
        const creato = await sh('/accounts', 'POST', payload);
        accountId = creato.id;
        accountCreati++;
        appenaCreato = true;
      } catch (e) {
        if (e.status === 409) {
          // Nome gia' presente su SoftHiring (magari creato a mano): lo ritrova
          // invece di fallire, cosi' i contatti finiscono sull'account giusto.
          const elenco = await sh(`/accounts?search=${encodeURIComponent(az.name)}`);
          const trovato = Array.isArray(elenco) ? elenco.find((a) => a.name === az.name) : null;
          if (!trovato) throw e;
          accountId = trovato.id;
          accountRiusati++;
        } else throw e;
      }
      await sb(`companies?id=eq.${az.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ softhiring_account_id: accountId }) });
    } else {
      accountRiusati++;
    }

    // Contatti — tutti quelli reali dell'azienda, non solo chi ha l'email.
    const daSincronizzare = contattiPerAzienda.get(az.id) || [];
    let scrittiQui = 0, esistentiQui = 0;
    for (const contatto of daSincronizzare) {
      if (!APPLY) continue;
      const { firstName, lastName } = splitNome(contatto.nome);
      try {
        await sh('/contacts', 'POST', {
          accountId, firstName, lastName,
          email: contatto.email || undefined,
          roleLabel: contatto.ruolo || undefined,
          isDecisionMaker: contatto.ruolo ? TITOLI_DECISION_MAKER.test(contatto.ruolo) : false,
        });
        scrittiQui++;
      } catch (e) {
        if (e.status === 409) esistentiQui++; // contatto gia' presente su SoftHiring
        else throw e;
      }
    }
    contattiCreati += scrittiQui; contattiEsistenti += esistentiQui;

    console.log(APPLY
      ? `${G}account ${accountId}${appenaCreato ? ' (nuovo)' : ' (riusato)'} · ${scrittiQui} contatti nuovi, ${esistentiQui} gia' presenti${Z}`
      : `${Y}riuserebbe account ${accountId}${Z}`);
  } catch (e) {
    errori++;
    console.log(`${R}${String(e.message).slice(0, 100)}${Z}`);
  }
  if (APPLY) await new Promise((ok) => setTimeout(ok, 300));
}

console.log(`\n${'─'.repeat(84)}`);
console.log(`${B}RISULTATO${Z} su ${campione.length} aziende`);
console.log(`  account creati: ${accountCreati} · account riusati: ${accountRiusati} · contatti creati: ${contattiCreati} · contatti gia' presenti: ${contattiEsistenti} · errori: ${errori}`);
if (!APPLY) console.log(`  ${Y}solo misura: nessuna chiamata fatta a SoftHiring. Rilancia con --apply per scrivere davvero.${Z}`);
console.log('');
