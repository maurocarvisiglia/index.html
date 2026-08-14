-- PARTE 8: Permetti la scrittura su company_contacts dal browser (anon key)
-- Necessario per la modifica manuale dei Decision Maker dalla scheda azienda.
-- Stesso livello di sicurezza gia' in uso per companies/job_listings (scritti
-- dal browser con la chiave anon) — non introduce un rischio nuovo, estende
-- lo stesso modello gia' accettato a questa tabella.
-- Esegui nell'SQL Editor di Supabase

CREATE POLICY "company_contacts_write" ON company_contacts
  FOR ALL USING (true) WITH CHECK (true);

-- Verifica
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'company_contacts'
ORDER BY policyname;
