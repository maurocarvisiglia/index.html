-- Il filtro "rilevante" per il mercato Life Sciences era un giudizio dell'IA
-- che SCARTAVA silenziosamente l'articolo prima di scriverlo — Mauro ha fatto
-- notare il 12/09/2026 che non gliel'aveva mai chiesto, e che alcuni articoli
-- scartati (rinnovo CCNL farmacie, classifiche universita', un pezzo su
-- funding HealthTech italiano) erano invece potenzialmente utili.
--
-- Da qui in poi NULLA viene scartato per giudizio di rilevanza: ogni articolo
-- che supera la verifica anti-allucinazione (citazione presente davvero nel
-- testo scaricato — quella resta, e' una garanzia di affidabilita' del dato,
-- non un giudizio di interesse) finisce in market_rumors, con "rilevante"
-- come campo visibile e filtrabile in app, mai piu' una porta chiusa a monte.

alter table public.market_rumors
  add column if not exists rilevante boolean not null default true;

-- Le righe gia' presenti sono tutte passate dal vecchio filtro (solo
-- rilevante=true veniva scritto): il default true e' gia' corretto per loro,
-- nessun backfill necessario.

create index if not exists idx_market_rumors_rilevante on public.market_rumors (rilevante);

do $$
begin
  raise notice 'Colonna rilevante aggiunta a market_rumors: da ora e'' un filtro visibile in app, non piu'' un''esclusione silenziosa.';
end $$;
