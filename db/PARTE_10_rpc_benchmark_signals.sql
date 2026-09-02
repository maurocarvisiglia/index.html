-- Il tasto "Aggiorna benchmark" nell'app scrive direttamente su salary_benchmarks
-- e market_signals con la chiave anon del browser, ma entrambe le tabelle hanno
-- RLS che blocca INSERT/UPDATE per anon (stesso principio gia' applicato in
-- PARTE_4: la scrittura e' riservata a service_role). Il bottone falliva quindi
-- sempre in silenzio (401 "new row violates row-level security policy"),
-- diagnosticato il 02/09/2026 — 2 mesi di dati fermi senza che nessuno se ne
-- accorgesse, perche' il codice ingoiava l'errore.
--
-- Soluzione: non allargare i permessi di scrittura diretta sulla tabella (un
-- anon key esposto nel client potrebbe scrivere qualunque cosa), ma esporre 2
-- funzioni SECURITY DEFINER strette — girano con i permessi del proprietario
-- (bypassano RLS) ma accettano solo i campi previsti, nient'altro. Il client
-- continua a fare TUTTO il calcolo (gia' corretto), cambia solo come lo scrive.

-- ═══════════════════════════════════════════════════════════════
-- upsert_salary_benchmark: una riga per canonical_role (vincolo UNIQUE reale
-- sulla tabella e' su canonical_role da solo, non sulla combinazione con
-- therapeutic_area/region/... che il vecchio codice client assumeva).
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION upsert_salary_benchmark(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO salary_benchmarks (
    canonical_role, role_family, functional_area_v2, sub_area, therapeutic_area,
    region, company_type, sector_v2, sample_size, sample_with_ral, total_listings,
    p25, median, p75, p90, avg_ral, min_ral, max_ral,
    listings_30d, listings_90d, listings_365d, companies_count, updated_at
  ) VALUES (
    payload->>'canonical_role', payload->>'role_family', payload->>'functional_area_v2', payload->>'sub_area', payload->>'therapeutic_area',
    payload->>'region', payload->>'company_type', payload->>'sector_v2',
    (payload->>'sample_size')::int, (payload->>'sample_with_ral')::int, (payload->>'total_listings')::int,
    (payload->>'p25')::numeric, (payload->>'median')::numeric, (payload->>'p75')::numeric, (payload->>'p90')::numeric,
    (payload->>'avg_ral')::numeric, (payload->>'min_ral')::numeric, (payload->>'max_ral')::numeric,
    (payload->>'listings_30d')::int, (payload->>'listings_90d')::int, (payload->>'listings_365d')::int,
    (payload->>'companies_count')::int, now()
  )
  ON CONFLICT (canonical_role) DO UPDATE SET
    role_family = EXCLUDED.role_family,
    functional_area_v2 = EXCLUDED.functional_area_v2,
    sub_area = EXCLUDED.sub_area,
    therapeutic_area = EXCLUDED.therapeutic_area,
    region = EXCLUDED.region,
    company_type = EXCLUDED.company_type,
    sector_v2 = EXCLUDED.sector_v2,
    sample_size = EXCLUDED.sample_size,
    sample_with_ral = EXCLUDED.sample_with_ral,
    total_listings = EXCLUDED.total_listings,
    p25 = EXCLUDED.p25,
    median = EXCLUDED.median,
    p75 = EXCLUDED.p75,
    p90 = EXCLUDED.p90,
    avg_ral = EXCLUDED.avg_ral,
    min_ral = EXCLUDED.min_ral,
    max_ral = EXCLUDED.max_ral,
    listings_30d = EXCLUDED.listings_30d,
    listings_90d = EXCLUDED.listings_90d,
    listings_365d = EXCLUDED.listings_365d,
    companies_count = EXCLUDED.companies_count,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_salary_benchmark(jsonb) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- refresh_market_signals: pulizia >7 giorni + inserimento nuovo lotto in una
-- sola chiamata (il client passa l'array gia' calcolato da detectMarketSignals).
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION refresh_market_signals(signals jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM market_signals WHERE created_at < now() - interval '7 days';

  INSERT INTO market_signals (signal_type, company_name, severity, title, description)
  SELECT
    s->>'signal_type',
    s->>'company_name',
    s->>'severity',
    s->>'title',
    s->>'description'
  FROM jsonb_array_elements(signals) AS s;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_market_signals(jsonb) TO anon, authenticated;

-- Verifica
SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('upsert_salary_benchmark','refresh_market_signals');
