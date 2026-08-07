-- PARTE 4: Abilita RLS e crea policies

-- ═══════════════════════════════════════════════════════════════
-- Abilita Row Level Security
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE enrichment_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrichment_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapeutic_areas_glossary ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- Policies: Tutti gli utenti autenticati possono LEGGERE
-- ═══════════════════════════════════════════════════════════════
CREATE POLICY "enrichment_queue_read" ON enrichment_queue
  FOR SELECT USING (true);

CREATE POLICY "enrichment_log_read" ON enrichment_log
  FOR SELECT USING (true);

CREATE POLICY "company_contacts_read" ON company_contacts
  FOR SELECT USING (true);

CREATE POLICY "therapeutic_areas_read" ON therapeutic_areas_glossary
  FOR SELECT USING (true);

-- ═══════════════════════════════════════════════════════════════
-- NOTA IMPORTANTE sulla scrittura:
-- ═══════════════════════════════════════════════════════════════
-- NESSUNA policy di WRITE per autenticati su queste tabelle!
-- La scrittura è riservata solo a service_role (il backend Node.js)
--
-- Grazie alle RLS policies di default:
-- - Utenti anon/authenticated NON possono INSERT/UPDATE/DELETE
-- - Solo service_role (backend) può modificare i dati
-- ═══════════════════════════════════════════════════════════════

-- Verifica che le policies siano state create
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename IN ('enrichment_queue', 'enrichment_log', 'company_contacts', 'therapeutic_areas_glossary')
ORDER BY tablename, policyname;
