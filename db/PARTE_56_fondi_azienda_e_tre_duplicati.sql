-- ============================================================================
-- FUSIONE DUPLICATI · procedura riutilizzabile + tre casi certi — 28/09/2026
-- ----------------------------------------------------------------------------
-- Stessa procedura delle fusioni precedenti (20260923090000_fusione_agips.sql),
-- raccolta in una funzione perche' i casi da decidere sono molti e ognuno deve
-- toccare le stesse 21 tabelle collegate a companies. Rispetto ad Agips si
-- aggiungono le tabelle nate dopo: piano_contatto_trimestrale, company_email_log,
-- market_rumors e l'archivio Apollo (apollo_people_raw / _scarico /
-- apollo_organizations_raw / apollo_people_match_raw / apollo_domini_titolari).
--
-- Regole invariate: la riga perdente NON si cancella (is_active = false,
-- merged_into); nelle tabelle con indice unico si sposta solo cio' che la
-- superstite non ha; i campi anagrafici si completano solo dove la superstite
-- e' vuota — compresi account e softhiring_account_id, che quindi non vengono
-- MAI sovrascritti: per questo i casi con due account o due ID SoftHiring
-- diversi restano fuori da qui e li decide Mauro.
--
-- TRE CASI CERTI, decisi il 28/09/2026 (Mauro: "procedi" sui duplicati, uno per
-- uno): stessa P.IVA, stesso dominio, nessun conflitto di account o SoftHiring.
--   Advanced Accelerator Applications  P.IVA 01493500704  adacap.com
--   Mindray                            P.IVA 10127601002  mindray.com
--   Worldwide Clinical Trials / Wct    P.IVA 05881150964  worldwide.com
-- ============================================================================

create or replace function public.fondi_azienda(resta uuid, va_fusa uuid, nome_resta text, nome_fusa text)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- 0) Le due righe devono essere quelle attese, o non si tocca nulla.
  if not exists (select 1 from companies where id = resta and name = nome_resta and merged_into is null) then
    raise exception 'Superstite attesa (%, %) inesistente, rinominata o gia'' fusa.', nome_resta, resta;
  end if;
  if not exists (select 1 from companies where id = va_fusa and name = nome_fusa and merged_into is null) then
    raise exception 'Riga da fondere attesa (%, %) inesistente, rinominata o gia'' fusa.', nome_fusa, va_fusa;
  end if;
  if resta = va_fusa then raise exception 'Superstite e riga da fondere coincidono.'; end if;

  -- 1) Senza vincolo di unicita': si sposta tutto.
  update job_listings                set company_id = resta where company_id = va_fusa;
  update company_contacts            set company_id = resta where company_id = va_fusa;
  update market_signals              set company_id = resta where company_id = va_fusa;
  update insight_recruiter_originali set company_id = resta where company_id = va_fusa;
  update market_rumors               set company_id_principale = resta where company_id_principale = va_fusa;
  update apollo_people_match_raw     set company_id = resta where company_id = va_fusa;
  update apollo_domini_titolari      set company_id = resta where company_id = va_fusa;

  -- 2) Con indice unico: si sposta solo cio' che la superstite non ha.
  update company_products p set company_id = resta
   where p.company_id = va_fusa
     and not exists (select 1 from company_products s where s.company_id = resta and lower(s.brand_name) = lower(p.brand_name));
  delete from company_products where company_id = va_fusa;

  update company_workforce w set company_id = resta
   where w.company_id = va_fusa
     and not exists (select 1 from company_workforce s where s.company_id = resta and s.apollo_person_id = w.apollo_person_id);
  delete from company_workforce where company_id = va_fusa;

  update company_therapeutic_areas t set company_id = resta
   where t.company_id = va_fusa
     and not exists (select 1 from company_therapeutic_areas s where s.company_id = resta and s.code = t.code and s.fonte = t.fonte);
  delete from company_therapeutic_areas where company_id = va_fusa;

  update company_facts f set company_id = resta
   where f.company_id = va_fusa
     and not exists (select 1 from company_facts s where s.company_id = resta and s.tipo = f.tipo and s.valore_norm = f.valore_norm);
  delete from company_facts where company_id = va_fusa;

  update piano_contatto_trimestrale p set company_id = resta
   where p.company_id = va_fusa
     and not exists (select 1 from piano_contatto_trimestrale s where s.company_id = resta and s.mese = p.mese);
  delete from piano_contatto_trimestrale where company_id = va_fusa;

  update company_email_log e set company_id = resta
   where e.company_id = va_fusa
     and not exists (select 1 from company_email_log s where s.company_id = resta and s.controparte_email = e.controparte_email
                       and s.data_invio = e.data_invio and s.direzione = e.direzione);
  delete from company_email_log where company_id = va_fusa;

  update apollo_people_raw r set company_id = resta
   where r.company_id = va_fusa
     and not exists (select 1 from apollo_people_raw s where s.company_id = resta and s.apollo_person_id = r.apollo_person_id);
  delete from apollo_people_raw where company_id = va_fusa;

  -- Stato scarico e organizzazione arricchita: una riga per azienda. Si tiene
  -- quella della superstite; se non ce l'ha, passa quella della fusa.
  if exists (select 1 from apollo_people_scarico where company_id = resta) then
    delete from apollo_people_scarico where company_id = va_fusa;
  else
    update apollo_people_scarico set company_id = resta where company_id = va_fusa;
  end if;
  if exists (select 1 from apollo_organizations_raw where company_id = resta) then
    delete from apollo_organizations_raw where company_id = va_fusa;
  else
    update apollo_organizations_raw set company_id = resta where company_id = va_fusa;
  end if;

  -- 3) Reparti, coda e registri valgono per la riga, non per l'azienda.
  delete from company_department_headcount where company_id = va_fusa;
  delete from enrichment_queue             where company_id = va_fusa;
  delete from company_ta_lookup_log        where company_id = va_fusa;
  delete from company_facts_lookup_log     where company_id = va_fusa;
  -- enrichment_log NON si tocca: e' l'audit di QUELLA riga, che continua a esistere.

  -- 4) Campi anagrafici: solo dove la superstite e' vuota. Account e ID
  -- SoftHiring non vengono mai sovrascritti.
  update companies s set
    iva                   = coalesce(s.iva, f.iva),
    ragione_sociale       = coalesce(s.ragione_sociale, f.ragione_sociale),
    codice_ateco          = coalesce(s.codice_ateco, f.codice_ateco),
    activity_description  = coalesce(s.activity_description, f.activity_description),
    sector_v2             = coalesce(s.sector_v2, f.sector_v2),
    province              = coalesce(s.province, f.province),
    region                = coalesce(s.region, f.region),
    linkedin_url          = coalesce(s.linkedin_url, f.linkedin_url),
    descrizione_aziendale = coalesce(s.descrizione_aziendale, f.descrizione_aziendale),
    account               = coalesce(s.account, f.account),
    softhiring_account_id = coalesce(s.softhiring_account_id, f.softhiring_account_id)
  from companies f
  where s.id = resta and f.id = va_fusa;

  -- 5) La riga fusa esce di scena, ma resta leggibile.
  update companies set is_active = false, merged_into = resta where id = va_fusa;

  -- 6) Array denormalizzato delle aree, come nelle fusioni precedenti.
  update companies c
     set aree_terapeutiche = (select array_agg(distinct t.code order by t.code) from company_therapeutic_areas t where t.company_id = c.id)
   where c.id in (resta, va_fusa);
end;
$$;
revoke all on function public.fondi_azienda(uuid, uuid, text, text) from public, anon, authenticated;

-- Superstite: la scheda con account/ID SoftHiring (o, a parita', la piu' vecchia).
select public.fondi_azienda('086a7196-013a-4960-a909-465a08b4032c', '64c1d7be-3f6b-4d2e-b28a-06a1db3151bf',
                            'AAA ADVANCED ACCELERATOR APPLICATIONS', 'Advanced Accelerator Applications');
select public.fondi_azienda('a1eebed5-e5f4-41b2-90a4-12ec586a2c5c', '0a99c801-be53-4431-aba9-6e7a7aa1daaa',
                            'MINDRAY MEDICAL ITALY S.R.L.', 'Mindray');
select public.fondi_azienda('334ee2d8-b0bc-4b50-9f55-338b6e1957b6', '8b3fe49c-b674-46cb-a33f-0476fac886a3',
                            'WORLDWIDE CLINICAL TRIALS S.R.L. IN BREVE WCT S.R.L.', 'Wct');
