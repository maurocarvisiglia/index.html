-- Seconda passata della diagnostica tassonomia — richiesto da Mauro il 10/09/2026
-- ("diagnostica approfondita... posizioni inserite in contenitori e non
-- correttamente schedulati"). Stessa disciplina della prima passata (PARTE_30):
-- trovato con un punteggio di coerenza lessicale per ogni canonical_role con
-- 4+ annunci, poi verificato a mano ogni bucket sospetto.
--
-- "Addetto Accettazione" (33 annunci) mischiava receptionist veri con un
-- coordinatore infermieristico, un anestesista, un perfusionista (specialista
-- di sala operatoria per macchine cuore-polmone), un tecnico di radiologia
-- medica e un ASO (assistente studio odontoiatrico) — professioni regolamentate
-- completamente diverse, agganciate per errori di catalogazione storici.
-- "Medico" includeva un informatore medico scientifico (venditore farmaceutico,
-- non un medico) agganciato solo dal nome nudo del canonical_role "Medico"
-- (6 caratteri) dentro "INFORMATORE MEDICO SCIENTIFICO" — stesso identico bug
-- di "Medici"->Medico gia' corretto in PARTE_30.
--
-- Gia' fatto in questa sessione (via API, non richiede questo file):
--   - Coordinatore/trice Infermieristico[...] -> Infermiere
--   - Anestesista -> Medico (era gia' li' per errore diverso, ora corretto)
--   - Operatore socio-sanitario -> OSS (bucket gia' esistente)
--   - nuovo alias "Informatore Medico Scientifico" -> Informatore Scientifico
--     del Farmaco (piu' lungo del nome nudo "Medico", vince per specificita')
--   - "Tecnico di laboratorio" (CHIMEC) -> Tecnico di Laboratorio (l'alias in
--     tassonomia era gia' corretto, la riga era solo rimasta indietro)
--   - i job_listings coinvolti aggiornati di conseguenza in tutti i casi sopra
--
-- Questi 4 alias non hanno un bucket sensato (troppo specialistici/rari per
-- inventarne uno, o palesemente fuori scope) — eliminati cosi' i relativi
-- annunci (gia' impostati a canonical_role NULL) restano "non mappati" invece
-- di essere ripresi dal prossimo "Riclassifica tutto".

delete from public.job_aliases
where (alias, canonical_role) in (
  ('Perfusionista', 'Addetto Accettazione'),
  ('Tecnico di radiologia medica', 'Addetto Accettazione'),
  ('ASO appartenente alle Cat-Pro L.68/99', 'Addetto Accettazione'),
  ('Tesista - Digitalizzazione dei processi di laboratorio', 'Clinical Data Manager'),
  ('Podologo', 'Fisioterapista'),
  ('Junior Grant Officer', 'Market Access Specialist')
);
