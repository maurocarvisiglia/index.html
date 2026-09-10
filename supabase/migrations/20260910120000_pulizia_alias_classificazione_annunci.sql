-- Pulizia tassonomia classificazione annunci — richiesto da Mauro il 10/09/2026,
-- diagnosi partita da un report su "Analista Chimico" che pescava Zahntechniker
-- (odontotecnico, Ivoclar Vivadent), "Sr. Quality Engineer, Design Assurance"
-- (Orthofix) e "Assembler, EM" (Steris): 41 titoli di lavoro completamente diversi
-- erano tutti aliasati 1-a-1 su un solo canonical_role "Quality Control Analyst".
-- Estesa poi su richiesta di Mauro a una diagnostica generale su tutta la
-- tassonomia (1181 alias, 166 canonical_role, 2989 annunci): trovati altri alias
-- a UNA SOLA PAROLA generica che decidono da soli il ruolo di 2+ annunci a
-- prescindere dal contesto — stesso identico bug, in altri bucket.
--
-- Gia' fatto in questa sessione (via API, non richiede questo file):
--   - creati i canonical_role "Quality Engineer", "Quality Control Operator",
--     "Odontotecnico" (odontotecnico e' "una figura a se'", per scelta di Mauro),
--     "Infermiere" (un infermiere non e' un "Addetto Accettazione")
--   - 15 alias della famiglia Quality Control Analyst riassegnati ai bucket giusti
--   - "Assembler, EM" -> Operatore di Produzione ("tra gli operai", per scelta di Mauro)
--   - "Zahntechniker.../Dental Technician..." -> Odontotecnico
--   - "Magazziniere" -> Operatore Logistica (era Operatore di Produzione: magazziniere
--     e' logistica, non produzione)
--   - "Infermiere/a" -> Infermiere (nuovo, era Addetto Accettazione)
--   - i job_listings coinvolti aggiornati di conseguenza in tutti i casi sopra
--   - gli annunci che pescavano SOLO tramite "Tecnico"/"Commerciale" (generici,
--     vedi sotto) sono gia' stati ricalcolati: 14 sono risaliti a un alias piu'
--     specifico gia' esistente (es. "Tecnico della sicurezza" -> EHS/HSE Specialist,
--     "Rappresentante Commerciale Territorio" -> Medical Representative), i restanti
--     23 sono tornati "non mappati" (nessun alias specifico li copre davvero)
--
-- Questi alias non hanno un bucket sensato, o sono troppo generici per avere UN
-- target corretto (una sola parola comune che aggancia titoli di specialita'
-- diversissime, es. "Tecnico" prendeva sia tecnici HSE sia tecnici di laboratorio
-- biomedico sia assistenza diagnostica) — eliminati cosi' i relativi annunci
-- restano "non mappati" (canonical_role NULL, gia' impostato sui job_listings) e
-- finiscono nella coda di revisione manuale (unmapped_job_titles) invece di
-- restare silenziosamente mappati su un ruolo sbagliato o troppo largo.
--
-- Senza questa DELETE, un futuro "Riclassifica tutto" (runMassReclassify) troverebbe
-- ancora l'alias esatto e rimapperebbe questi annunci sui ruoli sbagliati,
-- vanificando la pulizia gia' fatta sui job_listings.

delete from public.job_aliases
where (alias, canonical_role) in (
  ('Quality Analyst', 'Quality Control Analyst'),
  ('Quality Control Expert', 'Quality Control Analyst'),
  ('QC Technology & Innovation Specialist', 'Quality Control Analyst'),
  ('Tecnico calibrazione strumentale', 'Quality Control Analyst'),
  ('Tecnico', 'EHS/HSE Specialist'),
  ('Commerciale', 'Medical Representative')
);
