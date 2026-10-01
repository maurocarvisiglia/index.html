/**
 * TASSONOMIA ORGANICO PER FUNZIONE — unica fonte
 * =============================================================================
 * Usata dal job giornaliero (apollo-unificato-giornaliero.mjs) e da
 * scripts/organico-classifica.mjs, che ricostruisce company_workforce
 * dall'archivio apollo_people_raw. Le regole si migliorano QUI e poi si
 * rilancia il classificatore: l'archivio conserva tutti i titoli.
 *
 * REVISIONE 28/09/2026 — misurata su tutte le 244.558 persone attribuite
 * (dopo la risoluzione dei domini condivisi). Prima: 32,1% classificate. I
 * buchi erano precisi:
 *   - informatori scientifici (ISF, drug/medical scientific informer...) mai
 *     riconosciuti: ~7.000 persone
 *   - personale sanitario (nurse, physiotherapist, psychologist...) senza
 *     nessuna funzione: ~10.000
 *   - qualita', produzione, R&D, regulatory esistevano solo per CDMO: in
 *     farma/device/consumer venivano scartati
 *   - 5 archetipi (CRO, consumer, servizi sanitari, digital health,
 *     consulenza) avevano i codici nel database ma nessuna regola
 *   - titoli italiani (responsabile, tecnico, addetto...) quasi ignorati
 * Titoli generici per natura (employee, worker, consultant isolati) vanno in
 * 'generico_non_classificabile': dichiarati, non forzati in una funzione.
 *
 * REVISIONE 01/10/2026 — richiesto da Mauro dopo l'introduzione del benchmark
 * organico nei report ("quanti ISF trovo in provincia di Bergamo"): il
 * pattern INFORMATORI esisteva gia' ma finiva dentro 'sales_commercial' come
 * tutto il resto delle vendite, mai isolabile (332 persone su tutto
 * l'archivio). Nuovo codice dedicato 'isf_informatore_scientifico', stesso
 * livello universale di prima (si applica a qualunque settore).
 *
 * REVISIONE 01/10/2026 (parte 2) — granularita' commerciale completa + giro di
 * classificazione sui titoli rimasti fuori: Mauro ha chiesto di separare Key
 * Account Manager / Area Manager / Sales-Commercial Director / Export Manager
 * dal generico 'sales_commercial' (10.274 persone, troppo ampio per un
 * recruiting mirato), e di alzare la copertura sul 12% non classificato
 * (26.352 persone, 17.085 titoli distinti). Dump completo analizzato: oltre
 * ai 4 nuovi codici, aggiunte regole per cluster reali con volume ricorrente
 * (laboratorio, relazioni clienti, CSV/qualita', continuous improvement,
 * clinical team, pharmacy advisor, market access universale, scaffalisti,
 * back-office con trattino). La parte irriducibile (titoli vuoti ~1.826,
 * credenziali scambiate per titolo come "MBA"/"Dr", o persone con un lavoro
 * che non ha nulla a che fare col settore come "Waiter"/"Military") resta
 * dichiarata non classificabile per scelta, non forzata in una funzione.
 *
 * ORDINE: prima la lista specifica dell'archetipo, poi UNIVERSALE nell'ordine
 * scritto. Vince la prima regola che combacia, quindi l'ordine e' voluto: gli
 * informatori prima del personale medico ("informatore medico scientifico"),
 * il personale sanitario prima della qualita' ("biomedical lab technician"),
 * la produzione prima dell'R&D ("operatore chimico").
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

// ── Frammenti riusati in piu' regole ─────────────────────────────────────────
const INFORMATORI = /\bisf\b|\bi\.s\.f\.?|informat(ore|ori|rice|rici) (scientific|medic|farmac|del farmaco)|informator[ei]|scientific inform|drug (scientific|medical) (informer|representative|specialist)|medical (scientific )?(informer|representative|rep\b|sales)|\binformant\b|\binformer\b|pharmaceutical (sales )?rep|scientific information (officer|specialist|representative|manager)|specialist[ae]? (di |del )?prodott|product specialist|\bmsr\b|scientific (sales )?representative|\bisf specialist/i;
const SERVIZIO_CLIENTI = /call ?cent|contact ?cent|customer (care|service|support|experience)|servizio clienti|assistenza clienti|customer relations|centralin|telefonist|operatore telefonic|help ?line|client (services|support)|relazion[ei].{0,15}client[ei]|esperienza clienti/i;

export const UNIVERSALE = [
  ['generico_non_classificabile', /self.?employed|freelance|libero professionista|lavorator[ei] autonom|\bpensionat|\bretired\b|volontari|\bvolunteer|disoccupat|unemployed|open to work|^employer$/i],
  ['hr', /\bhr\b|\bhrbp\b|\bchro\b|human resources?|risorse umane|people (and|&) culture|people (partner|manager|director|specialist|operations|business partner)|talent|recruit|selezion|\bselection\b|reclutament|chief happiness|employee.{0,3}(&|and).{0,3}labou?r|labou?r relations|relazioni (industriali|sindacali)|payroll|paghe|gestione del personale|responsabile del personale|ufficio personale|welfare|compensation|benefits? (specialist|manager)|learning (and|&) development|\bl&d\b|headhunter|staffing|employer branding|\bhris\b|\bhrm\b|onboarding specialist|training (manager|specialist|coordinator)/i],
  ['general_management', /\bceo\b|\bcoo\b|\bcfo\b|\bcto\b|\bcio\b|\bcmo\b|\bcco\b|\bcso\b|\bcdo\b|chief [a-z &-]*officer|country (manager|head|lead|director|president)|managing director|general manager|direttore generale|amministrator[ei] (delegat|unic)|business unit (director|head|manager|lead)|\bhead of\b.*\bbu\b|^director$|^direttore$|regional director|business area manager|member of the (management |executive )?board|board (member|director)|consiglier[ei] (di amministrazione|delegat)|\bpresident\b|presidente|vice.?president|\bsvp\b|\bevp\b|\bvp\b|co-?founder|\bfounder\b|fondat(ore|rice)|\bowner\b|titolare|general director|executive director|direttore (di stabilimento|di sede|di filiale)|site (director|head|leader)$|entrepreneur|imprenditor|deputy manager|dirigente (sanitario|aziendale)/i],
  ['legal_compliance', /\blegal\b|legale|avvocat|lawyer|attorney|\bcounsel\b|legal counsel|patent|brevett|intellectual property|privacy|\bdpo\b|data protection|compliance(?!.*quality)(?!.*regulatory)|anticorruzione|giurist|paralegal|notai|contract manager|ufficio contratti|corporate affairs? (lawyer|counsel)/i],
  ['it_digital', /\bit\b|\bict\b|\bitc\b|information technology|informatic|sistemi informativi|systems? (administrator|engineer|analyst|integrator|specialist)|sysadmin|software|developer|sviluppat(ore|rice) (software|web|app|java|python|front|back|full)|programmat|programmer|full.?stack|front.?end|back.?end|web (developer|designer|master)|devops|\bcloud\b|cyber|(it|information|cyber) security|security (engineer|analyst|architect)|network (engineer|administrator|specialist|manager)|network professional|\bsap\b|\berp\b|help ?desk|service.?desk|it support|database|\bdba\b|data (engineer|architect|analyst|scientist|manager(?=.*(it|digital)))|business intelligence|\bbi (analyst|developer|specialist)|machine learning|\bai\b|artificial intelligence|digital (transformation|innovation)|infrastruttur|\bux\b|\bui\b|user experience|\bsoftware tester|qa tester|test automation|\bict\b|functional analyst|test analyst|computer technician|tecnico informatico|analista funzional|data manager|\bims\b/i],
  ['procurement', /procurement|sourcing|\bbuyer\b|purchas|acquist|approvvigion|category manager (acquisti|procurement)|vendor management|supplier (quality|manager|development)/i],
  ['finance_admin', /financial|\bfinance\b|finanz|controll(er|ing)|accounting|accountant|contabil|bilancio|amministra|administrat|executive assistant|assistente (di )?direzion|segretar|secretary|receptionist|\breception\b|front[ -]?office|back[ -]?office|office (manager|assistant|clerk|administrator|staff|worker|employee|associate)|\bclerk\b|impiegat[oa] (amministrativ|contabil|di ufficio|ufficio)|treasury|tesoreri|\btreasurer\b|\bcredit\b|credit[oi] |\btax\b|fiscal|tribut|billing|fatturazion|invoic|internal audit|revisore|bookkeep|budget|cash (manager|management)|pagamenti|recupero crediti|accounts? payable|\bcontroller\b|\bpersonal assistant\b|\bpa to\b|data entry|accettazion|management control|controllo di gestione/i],
  ['logistics_supply_chain', /logistic|order to cash|\btender(ing)?\b|\bcourier\b|\bgare\b|supply chain|\bplanning\b|\bplanner\b|pianificaz|programmazione (della )?produzione|warehouse|magazzin|distribution|distribuzion|contract analyst|export (operations|specialist|clerk|office|assistant|coordinator)|ufficio export|\bimport\b|shipping|spedizion|trasport|transport|\bdriver\b|autista|corriere|fleet|inventory|scort[ea]|materials? (handler|manager|coordinator)|carrellist|forklift|picking|picker|mulettist|customs|dogan|\bs&op\b|demand (planner|manager)|order (management|processing|entry)|gestione ordini|ufficio ordini/i],
  ['isf_informatore_scientifico', INFORMATORI],
  ['sales_commercial', SERVIZIO_CLIENTI],
  ['regulatory_affairs_prodotto', /regulatory|regolatori|affari regolatori|\bcmc\b|\bprrc\b|registration (manager|specialist|officer)|dossier/i],
  ['pharmacovigilance', /pharmacovigilance|farmacovigilanz|drug safety|\bvigilance\b|\bqppv\b|safety (physician|scientist|officer|associate|specialist)(?!.*(hse|ehs|workplace))|materiovigilanz|medical device vigilance/i],
  ['medical_affairs_msl', /medical science liaison|\bmsl\b|medical (manager|director|advisor|affairs|liaison|lead|expert|excellence|information)|scientific (advisor|liaison|affairs)|medical scientific (advisor|manager)/i],
  ['clinical_operations_locali', /clinical (research|trial|study|operations|project|monitor|site|country|development|team|manager|science)|\bcra\b|\bcta\b|\bctm\b|study (coordinator|manager|start.?up|specialist)|site (manager|monitor|activation)(?=.*clinic)|monitor clinico|sperimentazion|\bcrc\b|research nurse|clinical data|clinical support|principal investigator/i],
  ['market_access', /market access|value (&|and) access|health economics|\bheor\b|\bhta\b|health technology assessment|rimborsabilit|reimbursement/i],
  ['professioni_sanitarie', /(orthop(a)?edic|ortopedic[oa]|radiology|dental|neurophysiopatholog\w*|hearing aid|optical) (technician|technologist)|tecnic[oa] (ortopedic|sanitari|di radiolog|audioprotesist|di neurofisiopatolog)|emergency driver|autista soccorritore|ambulanz|professional educator|educator[ei] professional/i],
  ['infermieri_oss', /\bnurse\b|nursing|infermier|\boss\b|operator[ei] socio.?sanitari|health ?care (worker|assistant|aide|operator)|healthcare (assistant|support worker)|care (worker|giver|assistant|aide)|caregiver|badant|\basa\b|ausiliari[oa] (socio|sanitari)|midwife|ostetric[ao]\b|puericult|\bota\b|caposala|coordinat(ore|rice) infermieristic|nurse coordinator|head nurse|strumentista/i],
  ['personale_medico', /\bdoctor\b|physician|\bmedico\b|\bmedici\b|\bdott(\.|ore|oressa)? .*(medic|chirurg)|medical (doctor|specialist|consultant|officer|practitioner)|specialist (in|doctor|physician)|specializzand|cardiolog|chirurg|surgeon|\bsurgery\b|anestesi|anesthe|anaesthe|radiolog(ist|o|a)\b|pediatr|paediatr|ginecolog|gynaecolog|gynecolog|obstetrician|ortoped|orthop(a)?edic|neurolog|neurosurg|oncolog|dermatolog|oculist|ophthalmolog|dentist|odontoiatr|orthodont|ortodonzi|ortodontist|psychiatr|psichiatr|urolog|endocrinolog|gastroenterolog|nefrolog|nephrolog|pneumolog|pulmonolog|internist|internal medicine|medicina interna|geriatr|primario|head physician|chief physician|general practitioner|\bmmg\b|guardia medica|emergency (medicine|physician)|pronto soccorso|intensivist|rianimat|reumatolog|rheumatolog|allergolog|immunologist|infettivolog|hematolog|ematolog|pathologist|anatomopatolog|diabetolog|fisiatra|physiatr|otorino|otolaryngolog|angiolog|vascular surgeon|veterinar|\bvet\b|direttore sanitario|direttore medico|medical director(?=.*(hospital|clinic|ospedal|sanitar|health ?care))|neonatolog|cardiochirurg|endoscop|ecografista medico|epatolog|hepatolog|nutrizionista medico|medico di base|dirigente medico/i],
  ['professioni_sanitarie', /farmacist|pharmacist|pharmacy (advisor|specialist)|case manager|physiotherap|fisioterap|physical therapist|speech (therapist|pathologist|and language)|logoped|occupational therap|terapist|therapist|psicolog|psycholog|psicoterap|psychotherap|neuropsicolog|educator[ei]? professional|dietist|dietitian|dietician|nutritionist|nutrizionist|biolog[oa] nutrizionist|podolog|podiatr|osteopat|chiropract|chiroprat|audiometr|audioprotes|audioprotest|audiolog|hearing (care|aid|specialist)|ortottist|orthoptist|\boptician\b|\bottic[oa]\b|\boptical\b|optometr|igienista dentale|dental hygien|dental (assistant|nurse|technician)|assistente (alla )?poltrona|\baso\b|odontotecnic|tecnic[oa] (sanitari[oa] )?(di )?radiolog|radiology technician|radiographer|\btsrm\b|tecnico sanitario|biomedical (lab(oratory)? )?(technician|scientist)|medical (laboratory|lab|radiology|imaging) (technician|scientist|technologist)|tecnico di laboratorio biomedico|\btlb\b|perfusionist|neurofisiopatolog|neurophysiolog|sonographer|ecografist|dialysis|dialisi|soccorritor|paramedic|\bemt\b|rehabilitation|riabilitaz|massofisioterap|massaggiator|chinesiolog|kinesiolog|animat(ore|rice) (socio|sociale)|assistente sociale|social worker|(?<!career )\bcounsel(l)?or\b|pedagogist|psicomotricist|psychomotric|clinical psycholog|laureat[oa] in scienze motorie|personal trainer|istruttor|fitness|sport (therapist|scientist)/i],
  ['quality_control', /\bqc\b|\bcq\b|quality control|controllo qualit|\banalista\b|analyst (chimic|microbiol|qc|lab)|chemical analyst|lab(oratory)? (analyst|technician|tecnic|assistant|specialist|operator)|tecnic[oa] di laboratorio|laboratorio analisi|microbiolog|chimic[oa] analist|analytical (chemist|scientist|specialist|development)|quality inspector|ispettor[ei] (della )?qualit|collaud|inspection|ispezion|responsabile (del |di )?laboratorio|capo laboratorio|coordinat(ore|rice) di laboratorio|specialista di laboratorio|laboratory (manager|head|director|supervisor)/i],
  ['quality_assurance', /\bqa\b|quality assurance|assicurazione (della )?qualit|garanzia (della )?qualit|qualified person|\bqp\b|\bgmp\b|\bgxp\b|\bgdp\b|validation|convalid|qualifica(zione)? (impianti|sistemi)|compliance.*quality|quality (manager|director|head|lead|specialist|engineer|system|compliance|officer|responsible|coordinator|expert|partner|auditor|associate|analyst|management|department|unit)|responsabile (della )?qualit|sistema qualit|ufficio qualit|\biso ?(9001|13485|22716)|\bauditor\b|\bcsv\b|data integrity specialist|qualification specialist|specialista (della )?qualit[aà]/i],
  ['quality_assurance', /\bquality\b|qualit[aà]\b/i],
  ['facilities_maintenance', /\bmaintenance\b|manutenzion|manutent/i],
  ['produzione_site_operations', /production|produzion|productive|manufactur|fabbricaz|\bplant\b|stabiliment|operai[oa]?\b|\bworker\b|blue collar|factory|fabbrica|shop ?floor|assembl|montaggio|montat(ore|rice)|\bpainting\b|\bpainter\b|verniciat|welder|saldat|machin(e|ist) (operator|tender)|macchinist|conduttore (di )?(macchin|impiant|linea)|operat(ore|rice) (di |alla |su |del )?(macchin|linea|impiant|produzion|reparto|cnc|confezionament|process)|line (operator|leader|worker|supervisor)|capo ?(linea|reparto|turno)|caporeparto|capoturno|shift (leader|supervisor|manager|worker)|packag|confezion|imballag|\bfilling\b|riempiment|blister|lavorazion|attrezzist|tornitor|fresator|\bcnc\b|stampaggio|injection mo(u)?lding|extrusion|estrusi|granulaz|\bcompression\b|sterile|asettic|aseptic|fermentation|operat(ore|rice) (farmaceutic|chimic|di process)|process operator|\boperat(or|ore|rice)\b|\bgmp operator|\bmanodoper|\bmagazziniere di produzione|confectioner|pasticcer|cuoc[oa]|\bchef\b|food (operator|production)|butcher|macelleri|gastronom|\bbarista\b|\borafo|metalworker|preparatore|caposquadra/i],
  ['produzione_site_operations', /operations? (manager|director|lead|head|supervisor|coordinator|specialist)|head of operations|site manager|responsabile (delle )?operations|continuous improvement|operational excellence/i],
  ['rd_formulazione', /\br ?(&|and) ?d\b|\bresearch(er)?s?\b|ricerca|ricercat|scientist|scienziat|post.?doc|\bphd\b|dottorand|biolog(ist|o|a|i)\b|biotechnolog|biotecnolog|\bchemist\b|\bchimic[oa]\b|pharmacolog|farmacolog|formulat|formulazion|innovation|innovazion|product development|sviluppo (prodott|formulazion|nuovi prodotti|galenico)|laboratory (manager|head|director)|lab manager|preclinical|discovery|bioinformatic|\bgenetic|genomic|molecular|in vitro|toxicolog|tossicolog|galenic|technologist|tecnolog[oa]\b|food technolog|scientific (director|officer|manager|project)|direttore scientifico|medical writer|scientific writer|\bwriter\b|science (manager|lead)|\bcmc (scientist|manager)/i],
  ['marketing_communications', /marketing|\bbrand\b|comunicazion|communication|\bpress\b|ufficio stampa|public relations|\bpr (manager|specialist|officer)|social media|\bcontent\b|copywriter|graphic|grafic[oa]|(?<!(mechanical|cad|technical|electrical|industrial|hardware|pcb|structural|3d) )designer|art director|creative|creativ|\bvisual\b|\bevent|eventi|congress|digital|\bseo\b|\bsem\b|advertising|pubblicit|media (buyer|planner|manager|specialist)|trade marketing|category manager|market (analyst|research|intelligence|insight)|ricerche di mercato|consumer insight|\binsight|crm (manager|specialist)|customer (and|excellence|facing|engagement)|omnichannel|corporate affairs|public (policy|affairs)|government affairs|relazioni istituzional|institutional (relations|affairs)|product manager|brand manager|\bgpm\b|\bfranchise\b|launch (lead|manager)|photograph|fotograf|video(maker| editor|grapher)|web (content|editor)|redattor|giornalist|journalist|editor\b/i],
  // Granularita' commerciale (01/10/2026): le 4 righe sotto intercettano i
  // profili commerciali con un'identita' di recruiting distinta PRIMA del
  // catch-all generico 'sales_commercial' — stesso principio di ISF sopra.
  // Il grosso del bucket generico resta sales_commercial (venditore/agente di
  // campo generico), che non e' un dato peggiore, e' la realta' quando il
  // titolo non specifica altro.
  ['key_account_manager', /key account|\bkam\b|national account manager|strategic account manager|\baccount manager\b|account specialist|\bsales account\b|\bsenior account\b|account executive/i],
  ['area_manager', /\barea manager\b|area sales manager|sales area manager|regional (sales )?manager|territory (sales )?manager|district (sales )?manager|district sales manager|country sales manager|\babm\b|area business manager|responsabile (di )?(zona|area)|field manager|field sales manager/i],
  ['sales_leadership', /sales director|commercial director|direttore (commerciale|delle vendite|vendite)/i],
  ['export_manager', /export (manager|area|director)/i],
  ['sales_commercial', /sales|responsabile nazionale vendite|inside sales|customer success|\bagent\b|business manager|commercial|vendit|venditor|\bseller\b|salesperson|salesman|saleswoman|\bagente\b|rappresentant|representative|\btrade\b|\bretail\b|\bstore\b|negozio|punto vendita|\bshop\b|showroom|filiale|branch manager|capo ?filiale|addett[oa] (alle? )?vendit|commess[oa]|cassier|cashier|banconist|beauty (consultant|advisor|specialist|expert|ambassador)|consulente (di bellezza|commerciale|di vendita|d'immagine)|\bbeauty\b|estetist|beautician|make.?up|visagist|truccat(ore|rice)|promoter|promotore|merchandis|pre.?sales|after.?sales|post.?vendita|\bchannel\b|partner manager|\bdistributor\b|\bdealer\b|tele.?sell|venditrice|consiglier[ae] di bellezza|client advisor|fashion (advisor|consultant)|\bhair|parrucch|colorist|\bstylist|\bnetworker|\bnetworking\b|\bmerchant\b|products? specialist|scaffalist|addett[oa] (al )?(allestimento )?scaffal|key holder/i],
  ['business_development', /business develop|sviluppo (del )?business|market development|therapy development|new business|licensing|partnership|alliance|\bm&a\b|corporate development|\bstrategy\b|strategic|strategi[ac]|business (analyst|consultant|specialist|partner)|business intelligence manager/i],
  ['facilities_maintenance', /\bmaintenance\b|manutenzion|manutent|facilit(y|ies)|servizi generali|general services|\behs\b|\bhse\b|\bsafety\b|sicurezza (sul lavoro|e ambiente|aziendale)?|security (guard|officer|manager)|vigilanz|\bguardia\b|portier|custode|pulizi|cleaning|\bcleaner\b|housekeep|electrician|elettricist|idraulic|plumber|\bhvac\b|impiantist|energy manager|\butilities\b|\brspp\b|\baspp\b|prevenzione (e )?protezione|environmental|ambiental|sustainab|sostenibil|waste|rifiuti/i],
  ['engineering_tecnico', /engineer|ingegner|engineering|tecnic[oi]\b|technician|technical|\bperit[oa]\b|progettist|\bcad\b|(mechanical|technical|electrical|industrial|hardware|pcb|structural) designer|drafts|disegnat(ore|rice)|automation|automazion|robotic|mechatron|meccatron|metrolog|calibrat|taratur|\binstrument|strumentazion|field (service|technician|specialist|application)|installat(or|ore)|install|service (technician|specialist|engineer)|specialist[ae]? tecnic|technical specialist|\bmeccanic[oa]\b|\bmechanic\b|elettronic|electronic|hardware|firmware|application specialist|architect|architett|surveyor|geolog|\bfse\b|process expert|\bmechanical\b|medical physicist|prototipist/i],
  ['project_management', /project (manager|management|leader|coordinator|lead|specialist|director|officer|assistant|controller|analyst)|program(me)? (manager|director|lead)|\bpmo\b|\bpm\b|^project$|scrum|agile coach|product owner|portfolio manager|capo ?progett|responsabile (di |dei )?progett|gestione (dei )?progett|delivery (manager|specialist|lead|account)|business process analyst|site coordinator/i],
  ['stage_formazione', /\bintern\b|internship|stagist|stagiair|\bstage\b|tirocin|trainee|apprendist|apprentice|student|studente|studentessa|\bgraduate\b|neolaureat|borsist|scholarship|\bfellow(ship)?\b|work experience|alternanza|junior trainee|\bpraktikant|\bassistant professor|lecturer|professor|docente|teacher|insegnant|trainer|formator|\btutor\b|educator/i],
  ['generico_non_classificabile', /^(employees?|dipendente|impiegat[oa]|staff|staff member|team member|member|membro|collaborat(ore|rice|or)|consultant|consulente|freelancer?|libero professionista|professional|professionista|manager|responsabile|specialist|specialista|expert|esperto|coordinator|coordinat(ore|rice)|supervisor|supervisore|team leader|leader|head|director|assistant|assistente|associate|senior associate|officer|advisor|addett[oa]|volunteer|volontari[oa]|retired|pensionat[oa]|in pensione|n\/?a|-+|\.+|none|\?+|senior|junior|lead|partner|socio|principal|analyst|administrative)$|self.?employed|freelance|libero professionista|volontari|volunteer|pensionat|\bretired\b|lavorator[ei] autonom|\bautonomo\b|disoccupat|unemployed|looking for|in cerca di|open to work|\bmember of\b|^(department|unit|team|group|senior|company) (head|manager|leader)$|^(capo ?gruppo|responsabile di gestione.*|senior (consultant|analyst|manager|specialist))$|^(voluntary|diploma|degree|housewife|casalinga|not available|from the system|specializing|official|responsible|assistance|hostess|steward|middle school diploma|third year of middle school|laurea|diplom.*|licenza media)$/i],
];

// ── Livello 2 — per archetipo. Prima della lista universale. ─────────────────
const FARMA_COMMERCIALE = [
  ['medical_affairs_msl', /medical science liaison|\bmsl\b|medical (manager|director|advisor|affairs|liaison|specialist|lead|expert|excellence|information|scientific)|scientific (advisor|liaison)/i],
  ['market_access', /market access|value (&|and) access|health economics|\bheor\b|pricing|reimbursement|rimborsabilit|\bhta\b|health technology assessment|payer|regional affairs? manager|\baccess (manager|lead|director|specialist)/i],
  ['regulatory_affairs_prodotto', /regulatory affairs|regulatory|regolatori/i],
  ['pharmacovigilance', /pharmacovigilance|farmacovigilanz|drug safety|country safety lead|\bqppv\b/i],
  ['clinical_operations_locali', /clinical (country|site lead|trial|research|operations|study|project|monitor)|\bcra\b|\bcta\b|study (manager|coordinator|start.?up)/i],
  ['patient_support', /care manager|patient (support|services|engagement|access|advocacy|program)|nurse educator|home care/i],
  ['quality_control', /\bqc\b|quality control|controllo qualit|\banalista\b|lab(oratory)? (analyst|technician)|tecnic[oa] di laboratorio|microbiolog/i],
  ['quality_assurance', /\bquality\b|\bqa\b|\bgmp\b|qualified person/i],
];
const MEDICAL_DEVICE_DIAGNOSTICS = [
  ['training_clinico', /\btraining\b|education specialist|clinical educator|formazione (clinica|tecnica)/i],
  ['clinical_affairs_device', /clinical (research|application|specialist|safety|project|business intelligence|evaluation|study|operations|consultant|educator|affairs)|application specialist|specialist[ae]? (clinic|applicativ)|medical (science|affairs|writer|customer care)|biostatistic|patient service/i],
  ['regulatory_mdr_ivdr', /regulatory affairs|regulatory|\bprrc\b|\bmdr\b|\bivdr\b|regolatori/i],
  ['field_service', /field service|service (&|and) repair|technical (consultant|service|svc|support)|repair engineer|field (engineer|technical|technician)|start-up specialist|product support|service (engineer|technician|specialist|manager)|tecnic[oa] (di )?(assistenza|service|manutenzione)|assistenza tecnica|customer service engineer|installation/i],
  ['product_management_device', /product (manager|specialist|marketing|owner)/i],
];
const PRODUZIONE_CDMO_CHIMICO = [
  ['facilities_maintenance', /\bmaintenance\b|manutenzion|manutent/i],
  ['business_development_conto_terzi', /\bcdmo\b|\bgkam\b|screening and quoting|lead generation/i],
  ['rd_formulazione', /\br(&|and)d\b|research and development|\bricercatore\b|\bresearch|analytical (r&d|development|scientist)|formulat|innovation (manager|technician|technologist)|technical (manager|director|office)|\bphd\b/i],
  ['registrazione_conformita', /regulatory affairs|\breach\b|product regulations|registration manager|stewardship|regulatory technical support|regulatory/i],
  ['quality_assurance', /\bqa\b|quality assurance|qualified person|\bqp\b|gmp compliance|validation (specialist|analyst|analist)|vp.*quality|global quality|computer system validation|quality (manager|director|head|system|compliance)/i],
  ['quality_control', /\bqc\b|\bcq\b|quality control|controllo qualit|analista (del )?controllo|laboratory (technician|assistant)|\blab\b.*(technician|manager|supervisor)|lab analyst|chemical analyst|analista (di )?laboratorio|analytical chemist|microbiology|\banalista\b|tecnic[oa] di laboratorio/i],
  ['ehs_sustainability', /\bhse\b|\behs\b|sustainab|health (and|&) safety|environmental|waste manager|\brspp\b|\baspp\b/i],
  ['process_engineering', /process (engineer|chemistry|improvement|technologist|development|safety)|automation (engineer|specialist)|tecnologo di processo|\b(d|u)sp\b|piping.*engineering|corporate (engineering|electrical|field|project) (manager|engineer)|\bproject engineer\b|industrializ|technology transfer/i],
  ['produzione_site_operations', /production (manager|operator|planner|assistant|supervisor|coordinator|specialist|engineer|engineering)|plant (manager|director|supervisor)|shift (manager|supervisor|leader)|operatore (chimico|di|impiant[oi]|farmaceutico|polivalente|api)|operaio (chimico|di|tecnico|finissaggio)|conduttore (impianto|generatore)|reattorist|capo\s?turno|fermentation (production|operator|coordinator|process)|manufacturing (manager|assembler|engineer)|unit production|caporeparto|responsabile (produzione|turni di produzione|unit[aà] produttiva)|chemical (operator|process operator)|\b(general |skilled )?worker\b|\boperator\b|technical employee|perito chimico|\budp\b|head of production|\bsite\b.*(production|services|manager|planner|head)|operations director|head of.*(operations|production)/i],
];
const CRO = [
  ['clinical_operations_cro', /clinical (research|operations|trial|study|monitor|project|site)|\bcra\b|\bcta\b|\bctm\b|\bcrc\b|study (coordinator|manager|start.?up|specialist|associate)|site (activation|start.?up|management|monitor|contract)|feasibility|sperimentazion|\bmonitor\b/i],
  ['data_management_biostat', /data (manag|coordinator|analyst|scientist|review)|clinical data|biostatist|statistic|statistical programm|\bsas\b|programmer|epidemiolog|medical coding|\bcoder\b/i],
  ['project_management_clinico', /project (manager|management|lead|director|coordinator|specialist|assistant)|program(me)? manager|\bpm\b/i],
  ['business_development_proposal', /proposal|business develop|\bbid\b|budget (analyst|specialist)|contract (analyst|specialist|manager)/i],
];
const CONSUMER_NUTRACEUTICAL_COSMETICS = [
  ['ecommerce', /e-?commerce|\bonline\b|marketplace|amazon|digital commerce|web ?shop/i],
  ['rd_formulazione_consumer', /formulat|formulazion|\br ?(&|and) ?d\b|\bresearch\b|ricerca|sviluppo prodott|product development|cosmetic chemist|\bchemist\b|\bchimic[oa]\b|laborator|scientist|technolog|tecnolog[oa]\b|safety assessor|\bclaims?\b|packaging development/i],
  ['trade_marketing_retail', /\bstore\b|\bshop\b|negozio|punto vendita|\bretail\b|boutique|beauty (consultant|advisor|specialist|expert|ambassador)|consulente di bellezza|estetist|beautician|make.?up|visagist|sales (assistant|associate|advisor)|addett[oa] (alle? )?vendit|commess[oa]|cassier|cashier|capo ?filiale|branch manager|\bvisual\b|merchandis|trade marketing|category (manager|specialist)|promoter|franchis|naturopat|erborist|herbalist|consiglier[ae] di bellezza|client advisor|fashion (advisor|consultant)|\bhair|parrucch|colorist|\bstylist|vice ?(store|responsabile)|assistant (store )?manager|deputy (store )?manager|capogruppo/i],
];
const SERVIZI_SANITARI_FARMACIA = [
  ['farmacista', /farmacist|pharmacist|direttore (di|della) farmacia|titolare (di|della) farmacia|pharmacy (manager|director)/i],
  ['customer_service', /\breception|accettazion|front ?office|\bcup\b|prenotazion|booking|call ?cent|contact ?cent|centralin|segreteria (medica|clinica|di reparto|sanitaria)|medical secretary|patient (service|care coordinator|coordinator|relations)|customer (care|service|support)|servizio clienti|sportell/i],
  ['operations_punto_vendita', /\bstore\b|\bshop\b|negozio|punto vendita|\bretail\b|commess[oa]|banconist|addett[oa] (alle? )?vendit|sales (assistant|associate)|cassier|cashier|parafarmac|dermocosm|capo ?filiale|branch manager|vice ?(store|responsabile)|assistant store manager|store manager/i],
  ['professioni_sanitarie', /laborator|lab (technician|tech|analyst)|tecnic[oa] di laboratorio|\bbiolog|\banalista\b/i],
];
const DIGITAL_HEALTH = [
  ['product_management_software', /product (manager|owner|lead|director|designer)|\bpo\b/i],
  ['ux_ui', /\bux\b|\bui\b|user experience|user interface|interaction design|designer/i],
  ['data_science_ai', /data (scientist|analyst|engineer)|machine learning|\bml\b|\bai\b|artificial intelligence|deep learning|\bnlp\b|computer vision|bioinformatic|analytics/i],
  ['software_engineering', /software|developer|sviluppat|programm|full.?stack|front.?end|back.?end|mobile|\bios\b|android|devops|\bcloud\b|engineer(?!.*(sales|biomedical|clinical))|architect|tester|test automation/i],
  ['regulatory_samd', /regulatory|\bquality\b|iso ?13485|\bmdr\b|\bsamd\b/i],
  ['customer_success', /customer (success|care|support|service|experience)|implementation|onboarding|client (success|services)/i],
];
const CONSULENZA = [
  ['erogazione_consulenza', /consultant|consulente|advisor|advisory|\bauditor\b|\baudit\b|associate|engagement manager|\bpartner\b|\bprincipal\b|\bexpert\b|esperto|trainer|formator|docente|\bcoach\b|valutator|assessor|tecnic[oa] (ambientale|della sicurezza|della prevenzione)|geolog/i],
];
export const FUNZIONI_PER_ARCHETIPO = {
  farma_commerciale: FARMA_COMMERCIALE,
  medical_device_diagnostics: MEDICAL_DEVICE_DIAGNOSTICS,
  produzione_cdmo_chimico: PRODUZIONE_CDMO_CHIMICO,
  cro: CRO,
  consumer_nutraceutical_cosmetics: CONSUMER_NUTRACEUTICAL_COSMETICS,
  servizi_sanitari_farmacia: SERVIZI_SANITARI_FARMACIA,
  digital_health: DIGITAL_HEALTH,
  consulenza: CONSULENZA,
};

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
