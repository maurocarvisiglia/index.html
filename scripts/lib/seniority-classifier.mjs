export const SENIORITY_ROLE_OVERRIDE={
  // Il canonical_role e' un dato piu' affidabile del testo grezzo del titolo:
  // varianti come "Account Manager - Medication Delivery Solutions" non
  // contengono la stringa "key account" ma SONO Key Account Manager confermati.
  // Applicato ovunque il canonical_role e' gia' noto (vedi runPostImportEnrichment
  // Step 1); il fallback testuale sotto resta per quando non lo e' ancora.
  'Key Account Manager':t=>{
    if(/\blead\b/i.test(t)&&!/\bto\s+lead\b/i.test(t))return 'lead';
    if(/\bsenior\b|\bsr\.?\s/i.test(t))return 'senior_specialist';
    return 'specialist';
  }
};
export function classifySeniorityFromText(t,canonicalRole){
  if(!t)return null;
  if(canonicalRole&&SENIORITY_ROLE_OVERRIDE[canonicalRole])return SENIORITY_ROLE_OVERRIDE[canonicalRole](t);
  if(/\bstage\b|tirocin|\bintern(ship)?\b/i.test(t))return 'internship';
  // Direttore/Direttrice di farmacia: PRIMA del check generico "direttore" sotto,
  // altrimenti verrebbe scambiato per un director generico.
  if(/farmacist\w*\s+direttric|farmacist\w*\s+direttor|direttor\w*\s*\/?\s*direttric\w*\s+di\s+farmacia|direttric\w*\s+di\s+farmacia|direttor\w*\s+di\s+farmacia/i.test(t))return 'manager';
  // Vertici e capifunzione -> bucket unico 'lead'. Prima dei check generici su
  // "manager"/"director" sotto, che altrimenti vincerebbero sulla sottostringa
  // (es. "General Manager" contiene "manager").
  if(/\b(ceo|cfo|cto|coo|cmo|cso)\b|chief\s+\w+\s+officer|general manager|country manager|country head|senior director|managing director|direttore generale|direttore\s+paese|direttore\s+senior|amministratore delegato/i.test(t))return 'lead';
  if(/\bvp\b|vice president/i.test(t))return 'vp';
  if(/\bdirector\b|\bdirettore\b|\bdirettrice\b/i.test(t))return 'director';
  if(/head of|responsabile nazionale|capo\s+funzione/i.test(t))return 'lead';
  if(/\bjunior\b|neo[\s-]?laureat/i.test(t))return 'entry_level';
  if(/senior manager/i.test(t))return 'senior_manager';
  // "Key Account Manager" e varianti sono ruoli individuali (specialist/senior_specialist
  // in base all'esperienza), non di people management, nonostante il titolo contenga
  // "Manager" — eccezione testuale di riserva quando il canonical_role non e' ancora
  // noto (vedi SENIORITY_ROLE_OVERRIDE sopra per il caso normale). Se il titolo indica
  // esplicitamente la guida di altri key account (es. "Key Account Lead") resta "lead".
  // Va controllato PRIMA del check generico su "manager" qui sotto, altrimenti "manager"
  // vince sempre per la parola nel titolo (46 annunci scoperti classificati cosi').
  if(/key account/i.test(t)){
    if(/\blead\b/i.test(t)&&!/\bto\s+lead\b/i.test(t))return 'lead';
    if(/\bsenior\b|\bsr\.?\s/i.test(t))return 'senior_specialist';
    return 'specialist';
  }
  // Coordinator/Coordinatore: sempre manager (gestisce persone/processi).
  if(/coordinat/i.test(t))return 'manager';
  if(/\bmanager\b|\bresponsabile\b|\bcapo\b/i.test(t))return 'manager';
  // "lead" da solo intercetta anche l'uso verbale generico ("prepared to lead",
  // "ability to lead" nei requisiti soft-skill) che non indica alcun livello di
  // seniority — escluso esplicitamente.
  if(/\blead\b/i.test(t)&&!/\bto\s+lead\b/i.test(t))return 'lead';
  // "principal"/"distinguished" (IC senior track fuori dall'enum ufficiale, 12
  // annunci isolati) consolidato sul bucket esistente 'expert' invece di un
  // valore fuori-enum invisibile ai filtri.
  if(/\bprincipal\b|distinguished/i.test(t))return 'expert';
  if(/\bexpert\b/i.test(t))return 'expert';
  if(/\bsenior\b|\bsr\.?\s/i.test(t))return 'senior_specialist';
  if(/\bassociate\b|\bassistant\b|\bassistente\b/i.test(t))return 'associate';
  if(/\bspecialist\b|\bspecialista\b/i.test(t))return 'specialist';
  if(/\b0-1\s*ann|entry[\s-]?level/i.test(t))return 'entry_level';
  if(/\b1-3\s*anni/i.test(t))return 'associate';
  if(/\b3-6\s*anni/i.test(t))return 'specialist';
  if(/\b6-10\s*anni/i.test(t))return 'senior_specialist';
  if(/\b10\+?\s*anni/i.test(t))return 'expert';
  return null;
}
// Titolo prima (segnale piu' affidabile), poi descrizione come fallback — MA solo se
// il segnale nella descrizione non e' in un contesto che ne inverte il senso (es. "capacita'
// di formare e supervisionare il personale junior" descrive un ruolo SENIOR che forma i
// junior, non un ruolo junior: prima di questo controllo, "Sr CRA II - FSP Team" veniva
// classificato entry_level per la parola "junior" comparsa li'). null se nessun segnale
// affidabile in nessuno dei due: chi chiama NON deve sovrascrivere il valore esistente.
export const SENIORITY_INVERTING_CONTEXT_RE=/(supervision\w*|formare|coordinar\w*|gestir\w*|guidar\w*|affianca\w*|mentor\w*)[^.]{0,60}\b(junior|neolaureat\w*)\b/i;
export function classifySeniorityDeterministic(title,description,canonicalRole){
  const fromTitle=classifySeniorityFromText(title,canonicalRole);
  if(fromTitle)return fromTitle;
  if(description&&SENIORITY_INVERTING_CONTEXT_RE.test(description)){
    // Il segnale "junior" e' in un contesto che parla di TERZI (personale da formare),
    // non del ruolo stesso: tolto dalla descrizione prima di classificarla, cosi' il
    // resto della descrizione (se contiene altri segnali) puo' ancora essere usato.
    const cleaned=description.replace(SENIORITY_INVERTING_CONTEXT_RE,' ');
    return classifySeniorityFromText(cleaned,canonicalRole)||null;
  }
  return classifySeniorityFromText(description,canonicalRole)||null;
}
