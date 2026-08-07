-- PARTE 3: Crea RPC functions per monitoring

-- ═══════════════════════════════════════════════════════════════
-- RPC: enrichment_stats_daily()
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION enrichment_stats_daily()
RETURNS TABLE (
  completed BIGINT,
  in_progress BIGINT,
  pending BIGINT,
  failed BIGINT,
  avg_completeness NUMERIC,
  total_companies_enriched BIGINT,
  api_tavily_count BIGINT,
  api_brave_count BIGINT,
  api_jina_count BIGINT,
  api_firecrawl_count BIGINT,
  llm_groq_count BIGINT,
  llm_gemini_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM enrichment_queue WHERE stato = 'completed' AND DATE(updated_at) = CURRENT_DATE)::BIGINT,
    (SELECT COUNT(*) FROM enrichment_queue WHERE stato = 'in_progress')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_queue WHERE stato = 'pending')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_queue WHERE stato = 'failed' AND DATE(updated_at) = CURRENT_DATE)::BIGINT,
    (SELECT AVG(completezza_arricchimento)::NUMERIC FROM companies WHERE arricchito_il >= NOW() - INTERVAL '1 day'),
    (SELECT COUNT(*) FROM companies WHERE arricchito_il >= NOW() - INTERVAL '1 day')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_log WHERE DATE(timestamp) = CURRENT_DATE AND api_usata = 'tavily')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_log WHERE DATE(timestamp) = CURRENT_DATE AND api_usata = 'brave')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_log WHERE DATE(timestamp) = CURRENT_DATE AND api_usata = 'jina')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_log WHERE DATE(timestamp) = CURRENT_DATE AND api_usata = 'firecrawl')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_log WHERE DATE(timestamp) = CURRENT_DATE AND api_usata = 'groq')::BIGINT,
    (SELECT COUNT(*) FROM enrichment_log WHERE DATE(timestamp) = CURRENT_DATE AND api_usata = 'gemini')::BIGINT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION enrichment_stats_daily() TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════
-- RPC: get_company_job_frequency()
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_company_job_frequency(days INT DEFAULT 30)
RETURNS TABLE (
  company_id UUID,
  frequency BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    COUNT(j.id)::BIGINT as freq
  FROM companies c
  LEFT JOIN job_listings j ON j.company_id = c.id
    AND j.created_at >= NOW() - (days || ' days')::INTERVAL
  GROUP BY c.id
  ORDER BY freq DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_company_job_frequency(INT) TO authenticated, anon;

-- Verifica
SELECT * FROM enrichment_stats_daily() LIMIT 1;
