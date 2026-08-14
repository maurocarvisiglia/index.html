-- PARTE 7: RLS per le tabelle Apollo (mancava, per questo il browser le vedeva vuote
-- anche con dati presenti — la service_role bypassa sempre RLS, l'app no).
-- Stesso pattern di PARTE_4: lettura pubblica, scrittura riservata al backend.
-- Esegui nell'SQL Editor di Supabase

ALTER TABLE apollo_industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_department_headcount ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apollo_industries_read" ON apollo_industries
  FOR SELECT USING (true);

CREATE POLICY "company_department_headcount_read" ON company_department_headcount
  FOR SELECT USING (true);

-- Verifica
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename IN ('apollo_industries', 'company_department_headcount')
ORDER BY tablename, policyname;
