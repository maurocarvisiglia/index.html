/**
 * TASSONOMIA ORGANICO PER FUNZIONE — unica fonte (28/09/2026)
 * =============================================================================
 * Estratta identica da scripts/apollo-unificato-giornaliero.mjs, dove era
 * duplicata anche in organico-automatico-giornaliero.mjs. Usata dal job
 * giornaliero e da scripts/organico-classifica.mjs, che ricostruisce
 * company_workforce dall'archivio apollo_people_raw.
 *
 * Diagnosi del 28/09: con queste regole solo ~1 persona su 4 viene
 * riconosciuta. Le regole si migliorano QUI e poi si rilancia il classificatore:
 * l'archivio conserva tutti i titoli, non serve riscaricare nulla.
 */
export const SETTORE_ARCHETIPO = {
  Pharma: 'farma_commerciale', 'Mid Pharma': 'farma_commerciale', 'Big Pharma': 'farma_commerciale',
  'Specialty Pharma': 'farma_commerciale', Biotech: 'farma_commerciale',
  CDMO: 'produzione_cdmo_chimico', Chimico: 'produzione_cdmo_chimico', Agrochimica: 'produzione_cdmo_chimico',
  'Medical Devices': 'medical_device_diagnostics', Diagnostics: 'medical_device_diagnostics',
  CRO: 'cro',
  Nutraceutical: 'consumer_nutraceutical_cosmetics', Cosmetics: 'consumer_nutraceutical_cosmetics', 'Consumer Health': 'consumer_nutraceutical_cosmetics',
  'Digital Health': 'digital_health',
  'Healthcare Services': 'servizi_sanitari_farmacia', 'Farmacia/Retail': 'servizi_sanitari_farmacia',
  Consulenza: 'consulenza', 'EHS/HSE Consulting': 'consulenza',
};
export const UNIVERSALE = [
  ['general_management', /\bceo\b|\bcoo\b|\bcfo\b|country manager|managing director|general manager|business unit director|\bhead of\b.*\bbu\b|^director$|regional director|business area manager|member of the management board/i],
  ['hr', /\bhr\b|human resources|talent acquisition|chief happiness|employee.{0,3}(&|and).{0,3}labor|labour relations|recruiting/i],
  ['finance_admin', /financial planning|\bfinance\b|controller|accounting|administrative associate|executive assistant|accountant|payroll|treasury|\bcredit\b|\btax\b|financial controller/i],
  ['legal_compliance', /\blegal\b|patent attorney|patent counsel|compliance(?!.*quality)(?!.*regulatory)/i],
  ['it_digital', /\bit\b|\bitc\b|information technology|systems administrator|\bsap\b|help ?desk|service.?desk|networking|infrastrutture informatiche/i],
  ['procurement', /procurement|sourcing|\bbuyer\b|purchasing/i],
  ['logistics_supply_chain', /logistics?|order to cash|\btender\b|supply chain|planning.*logistic|warehouse|distribution|contract analyst|\bexport\b/i],
  ['marketing_communications', /marketing|digital.*innovation|omnichannel|customer (and|excellence|facing|engagement)|corporate affairs|public policy|congress|product manager/i],
  ['sales_commercial', /area business manager|\babm\b|district sales manager|\bkam\b|key account|sales (manager|representative|supervisor|specialist|agent|rep\b|operation)|responsabile nazionale vendite|\bsales\b|account manager|territory (sales )?manager|country sales manager|district manager|inside sales|customer (care|service|success)|\bagent\b|business manager|commerciale/i],
  ['business_development', /business development(?!.*conto terzi)(?!.*cdmo)|market development|therapy development/i],
  ['facilities_maintenance', /\bmaintenance\b|manutenzione|facilit(y|ies)|\behs\b|prevenzione (e )?protezione|energy manager|\butilities\b/i],
];
const FARMA_COMMERCIALE = [
  ['medical_affairs_msl', /medical science liaison|\bmsl\b|medical (manager|director|advisor|affairs|liaison)/i],
  ['market_access', /market access|value & access|health economics|pricing|regional affairs? manager/i],
  ['regulatory_affairs_prodotto', /regulatory affairs/i],
  ['pharmacovigilance', /pharmacovigilance|drug safety|country safety lead/i],
  ['clinical_operations_locali', /clinical (country|site lead|trial)/i],
  ['patient_support', /care manager/i],
  ['quality_assurance', /\bquality\b/i],
];
const MEDICAL_DEVICE_DIAGNOSTICS = [
  ['training_clinico', /\btraining\b|education specialist/i],
  ['clinical_affairs_device', /clinical (research|application|specialist|safety|project|business intelligence|evaluation|study|operations)|medical (science|affairs|writer|customer care)|biostatistic|patient service/i],
  ['regulatory_mdr_ivdr', /regulatory affairs|\bprrc\b/i],
  ['field_service', /field service|service (&|and) repair|technical (consultant|service|svc|support)|repair engineer|field (engineer|technical)|start-up specialist|product support/i],
  ['product_management_device', /product (manager|specialist|marketing|owner)/i],
];
const PRODUZIONE_CDMO_CHIMICO = [
  ['business_development_conto_terzi', /\bcdmo\b|\bgkam\b|screening and quoting|lead generation/i],
  ['rd_formulazione', /\br(&|and)d\b|research and development|\bricercatore\b|\bresearch|analytical (r&d|development|scientist)|formulat|innovation (manager|technician|technologist)|technical (manager|director|office)|\bphd\b/i],
  ['registrazione_conformita', /regulatory affairs|\breach\b|product regulations|registration manager|stewardship|regulatory technical support/i],
  ['quality_assurance', /\bqa\b|quality assurance|qualified person|\bqp\b|gmp compliance|validation (specialist|analyst|analist)|vp.*quality|global quality|computer system validation/i],
  ['quality_control', /\bqc\b|\bcq\b|quality control|controllo qualit|analista (del )?controllo|laboratory (technician|assistant)|\blab\b.*(technician|manager|supervisor)|lab analyst|chemical analyst|analista (di )?laboratorio|analytical chemist|microbiology/i],
  ['ehs_sustainability', /\bhse\b|\behs\b|sustainab|health (and|&) safety|environmental|waste manager|\brspp\b|\baspp\b/i],
  ['process_engineering', /process (engineer|chemistry|improvement|technologist|development|safety)|automation (engineer|specialist)|tecnologo di processo|\b(d|u)sp\b|piping.*engineering|corporate (engineering|electrical|field|project) (manager|engineer)|\bproject engineer\b|industrializ|technology transfer/i],
  ['produzione_site_operations', /production (manager|operator|planner|assistant|supervisor|coordinator|specialist|engineer|engineering)|plant (manager|director|supervisor)|shift (manager|supervisor|leader)|operatore (chimico|di|impiant[oi]|farmaceutico|polivalente|api)|operaio (chimico|di|tecnico|finissaggio)|conduttore (impianto|generatore)|reattorist|capo\s?turno|fermentation (production|operator|coordinator|process)|manufacturing (manager|assembler|engineer)|unit production|caporeparto|responsabile (produzione|turni di produzione|unit[aà] produttiva)|chemical (operator|process operator)|\b(general |skilled )?worker\b|\boperator\b|technical employee|perito chimico|\budp\b|head of production|\bsite\b.*(production|services|manager|planner|head)|operations director|head of.*(operations|production)/i],
];
export const FUNZIONI_PER_ARCHETIPO = { farma_commerciale: FARMA_COMMERCIALE, medical_device_diagnostics: MEDICAL_DEVICE_DIAGNOSTICS, produzione_cdmo_chimico: PRODUZIONE_CDMO_CHIMICO };
export const PAROLE_SOVRANAZIONALI = /\bemea\b|\bglobal\b|western europe|southwest europe|southern europe|\beurasia\b|\biberia\b|\bnordics?\b|\bdach\b|\bbenelux\b|\bcee\b|\beurope\b(?!an)|international/i;
export const PAESI = /\b(italy|italia|greece|israel|spain|portugal|france|switzerland|austria|germany|uk|turkey|poland|balkans|latam|india|anz|japan)\b/gi;
export function classificaAmbito(titolo) {
  const paesi = new Set((titolo.match(PAESI) || []).map((p) => p.toLowerCase()));
  if (PAROLE_SOVRANAZIONALI.test(titolo)) return /\bglobal\b/i.test(titolo) ? 'globale' : 'emea';
  if (paesi.size >= 2) return 'emea';
  return 'locale';
}
export function estraeSede(titolo) { const m = titolo.match(/([A-Z][a-zà-ù]+)\s+Site\b/); return m ? m[1] : null; }
export function classificaFunzione(titolo, listaSpecifica, archetipo) {
  for (const [funzione, re] of listaSpecifica) if (re.test(titolo)) return { livello: 'specifico', funzione, archetipo };
  for (const [funzione, re] of UNIVERSALE) if (re.test(titolo)) return { livello: 'universale', funzione, archetipo: null };
  return null;
}


// Riga di company_workforce per una persona dell'archivio, o null se il titolo
// non e' riconosciuto. Senza archetipo mappato (sector_v2 vuoto, Altro,
// Veterinary) si applica solo il livello universale: HR, finanza, vendite...
// esistono ovunque, mentre le funzioni specifiche restano non forzate.
export function rigaWorkforce(companyId, persona, sectorV2) {
  const titolo = (persona.title || '').trim();
  if (!titolo) return null;
  const archetipo = SETTORE_ARCHETIPO[sectorV2] || null;
  const cls = classificaFunzione(titolo, FUNZIONI_PER_ARCHETIPO[archetipo] || [], archetipo);
  if (!cls) return null;
  return {
    company_id: companyId, apollo_person_id: persona.apollo_person_id ?? persona.id,
    titolo_originale: titolo.slice(0, 300), livello: cls.livello, funzione: cls.funzione,
    archetipo: cls.archetipo, ambito: classificaAmbito(titolo), sede: estraeSede(titolo),
  };
}
