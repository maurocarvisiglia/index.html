-- =============================================================================
-- STESSA ORGANIZZAZIONE SU DOMINI DIVERSI -> GRUPPO CON CAPOGRUPPO — 29/09/2026
-- =============================================================================
-- Deciso da Mauro ("sistema questi con la stessa logica"): i 33 casi in cui la
-- stessa organizzazione Apollo risponde a piu' domini (Alfasigma / Alfa
-- Wassermann, Recordati ×2, Zambon / Z-Cube, Unilever ×2, Synlab ×2, Air
-- Liquide ×2, J&J ×2...) diventano gruppi con capogruppo, con la regola di
-- Fresenius (scripts/lib/apollo-gruppi.mjs): ogni persona va alla societa' il
-- cui nome corrisponde all'organizzazione Apollo, altrimenti alla capogruppo.
--
-- Capogruppo: la scheda il cui nome corrisponde all'organizzazione Apollo; a
-- parita' (o se nessuna corrisponde) quella coi dati piu' recenti. Si usa il
-- gruppo esistente dove c'e' (Johnson, Mylan); le schede gia' in un altro
-- gruppo non vengono spostate.
--
-- San Donato: i due sottodomini delle strutture (beatomatteo.,
-- smartdentalclinic.grupposandonato.it) sono lo stesso caso dei 4 istituti del
-- 28/09: si toglie il sito, resta in companies_siti_rimossi.
-- =============================================================================

-- comifar.it + phoenixpharmaitalia.it · Apollo "PHOENIX Pharma Italia" · capogruppo Phoenix pharma italia
with g as (insert into public.company_groups (name) values ('PHOENIX Pharma Italia') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('01365b54-d156-43fc-8250-67c940b58d9e'::uuid, 'ff241352-5b3b-4a5b-bbc3-8e51138768fa'::uuid, '40daeefd-7aa6-481a-a5f1-486f2f24e68c'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '01365b54-d156-43fc-8250-67c940b58d9e'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '01365b54-d156-43fc-8250-67c940b58d9e'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- sit-farmaceutici.com + sitpharma.com · Apollo "SIT Pharma | Laboratorio Farmaceutico SIT" · capogruppo SIT LABORATORIO FARMAC. Srl
with g as (insert into public.company_groups (name) values ('SIT Pharma') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('020d5868-ba44-437a-ae73-baf68e73c3b2'::uuid, 'dd995431-d0b6-4063-8f9d-28687570aee8'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '020d5868-ba44-437a-ae73-baf68e73c3b2'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '020d5868-ba44-437a-ae73-baf68e73c3b2'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- ibsa.it + ibsaitaly.it · Apollo "IBSA Italy" · capogruppo Ibsa
with g as (insert into public.company_groups (name) values ('IBSA Italy') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('02fa81b7-94e9-4e92-8137-c5dec13502f1'::uuid, '515a9fe5-e5da-4a45-893c-b5af6a77a7bb'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '02fa81b7-94e9-4e92-8137-c5dec13502f1'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '02fa81b7-94e9-4e92-8137-c5dec13502f1'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- dow.com + it.dow.com · Apollo "Dow" · capogruppo Dow Italia Divisione Commerciale S.R.L.
with g as (insert into public.company_groups (name) values ('Dow') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('fa69be4e-2292-488c-8ad4-16e0ed76e077'::uuid, '08d1ade9-800d-4ead-8db4-0b1933ce4075'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = 'fa69be4e-2292-488c-8ad4-16e0ed76e077'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = 'fa69be4e-2292-488c-8ad4-16e0ed76e077'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- microchem.it + munit.com · Apollo "Jetpharma SA" · capogruppo MUNIT SA
with g as (insert into public.company_groups (name) values ('Jetpharma SA') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('37478a68-5c07-4692-9c01-c98dd881e408'::uuid, '099f99cc-dd4c-4d3c-b51a-229338f42c5b'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '37478a68-5c07-4692-9c01-c98dd881e408'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '37478a68-5c07-4692-9c01-c98dd881e408'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- spafarma.com + spaspa.it · Apollo "SPA - Società Prodotti Antibiotici" · capogruppo Societa' Prodotti Antibiotici S.P.A.
with g as (insert into public.company_groups (name) values ('SPA - Società Prodotti Antibiotici') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('4081d0f9-518c-4f4b-9d5e-e359e5c6f257'::uuid, '1b259209-426a-40ee-9dcb-ebb49f19d373'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '4081d0f9-518c-4f4b-9d5e-e359e5c6f257'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '4081d0f9-518c-4f4b-9d5e-e359e5c6f257'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- deborahgroup.com + sodalisgroup.com · Apollo "Sodalis Group" · capogruppo Sodalis Group S.p.A.
with g as (insert into public.company_groups (name) values ('Sodalis Group') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('1b454604-dcdc-4ac0-bc45-f4ffa8d8e03f'::uuid, '1dfe0f47-46c2-4bed-89aa-c70b45dd47a9'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '1b454604-dcdc-4ac0-bc45-f4ffa8d8e03f'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '1b454604-dcdc-4ac0-bc45-f4ffa8d8e03f'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- mylan.it + viatris.it · Apollo "Meda Pharma Spa" · capogruppo VIATRIS PHARMA SRL
update public.companies set company_group_id = '47424b73-e380-4929-97af-86fea65764a0'::uuid where id in ('72b9e424-5c54-48da-a4ff-df18f82c8989'::uuid, '1c1b85cc-edf0-4a60-bfa0-60053067136c'::uuid) and company_group_id is null;
update public.company_groups set capogruppo_id = '72b9e424-5c54-48da-a4ff-df18f82c8989'::uuid, capogruppo_deciso_il = now() where id = '47424b73-e380-4929-97af-86fea65764a0'::uuid and capogruppo_id is null;

-- biolifeitaliana.it + masciabrunelli.it · Apollo "Mascia Brunelli S.p.A.  - Medical Division" · capogruppo MASCIA BRUNELLI S.P.A.
with g as (insert into public.company_groups (name) values ('Mascia Brunelli S.p.A.  - Medical Division') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('1c86af91-2df1-43b3-8d56-a660c3edcbb6'::uuid, '6aaacffa-eb11-4966-842b-1993c942379b'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '1c86af91-2df1-43b3-8d56-a660c3edcbb6'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '1c86af91-2df1-43b3-8d56-a660c3edcbb6'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- euromed-pharma.com + euromed.it · Apollo "Euromed Pharma" · capogruppo EUROMED SRL
with g as (insert into public.company_groups (name) values ('Euromed Pharma') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('34b93ca4-3237-4c5b-b73e-16ddbf96c9d0'::uuid, 'ed2373d6-f906-4015-b16d-3ce97d7fd7fe'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '34b93ca4-3237-4c5b-b73e-16ddbf96c9d0'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '34b93ca4-3237-4c5b-b73e-16ddbf96c9d0'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- farmaciasantalberto.farmagora.it + farmagora.it · Apollo "Farmagorà Holding" · capogruppo FARMAGORA
with g as (insert into public.company_groups (name) values ('Farmagorà Holding') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('e8721911-ff82-4e1c-bf94-773a04c58b30'::uuid, '377940a5-9eab-4df0-9b10-3f038367fc7d'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = 'e8721911-ff82-4e1c-bf94-773a04c58b30'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = 'e8721911-ff82-4e1c-bf94-773a04c58b30'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- alfasigma.com + it.alfasigma.com · Apollo "Alfasigma" · capogruppo Alfasigma
with g as (insert into public.company_groups (name) values ('Alfasigma') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('59c6ce20-fa59-402c-b030-302a4a27c6dd'::uuid, '3c1b5867-fdc3-4a3b-88a9-b41731601abe'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '59c6ce20-fa59-402c-b030-302a4a27c6dd'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '59c6ce20-fa59-402c-b030-302a4a27c6dd'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- groupe-lfb.com + lfb.fr · Apollo "LFB" · capogruppo Lfb Laboratoire Franc.du Fract
with g as (insert into public.company_groups (name) values ('LFB') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('3ffd05e0-5a0c-4b99-909b-a083fb6a5fa3'::uuid, 'f6faf08b-4d65-4677-91a2-891a837fdd97'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '3ffd05e0-5a0c-4b99-909b-a083fb6a5fa3'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '3ffd05e0-5a0c-4b99-909b-a083fb6a5fa3'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- sdn.synlab.it + synlab.it · Apollo "SYNLAB Italia" · capogruppo Synlab
with g as (insert into public.company_groups (name) values ('SYNLAB Italia') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('d34c50ce-fa1d-4aab-bc38-66f6a82de849'::uuid, '42ca007f-56fb-4034-af81-c92130670729'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = 'd34c50ce-fa1d-4aab-bc38-66f6a82de849'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = 'd34c50ce-fa1d-4aab-bc38-66f6a82de849'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- esteve.com + riemser.com · Apollo "ESTEVE" · capogruppo ESTEVE
with g as (insert into public.company_groups (name) values ('ESTEVE') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('4643e0e7-66d8-423d-8654-deee78da0387'::uuid, 'ec50dc1a-abad-4083-9fb1-5e64b5549669'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '4643e0e7-66d8-423d-8654-deee78da0387'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '4643e0e7-66d8-423d-8654-deee78da0387'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- gentium.com + jazzpharma.com · Apollo "Jazz Pharmaceuticals" · capogruppo Jazz Healthcare Italia S.r.l.
with g as (insert into public.company_groups (name) values ('Jazz Pharmaceuticals') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('a53d0971-b7f9-4239-85f8-0972b712027c'::uuid, 'e0e53e2d-0af9-4a23-8f91-a9b3c199c6e5'::uuid, '543e3671-b8a3-4f42-a926-08b86cac41ef'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = 'a53d0971-b7f9-4239-85f8-0972b712027c'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = 'a53d0971-b7f9-4239-85f8-0972b712027c'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- farmacrimi.it + gruppofarmacieitaliane.it · Apollo "Farmacie Italiane" · capogruppo FARMACRIMI ACILIA S.R.L.
with g as (insert into public.company_groups (name) values ('Farmacie Italiane') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('57a95407-ac82-4a7e-af5c-1a6912b3ed54'::uuid, '9e762ebb-58ed-4cea-9cbd-01e1cd37aeba'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '57a95407-ac82-4a7e-af5c-1a6912b3ed54'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '57a95407-ac82-4a7e-af5c-1a6912b3ed54'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- intercosmeticsgroup.com + silviomora.it · Apollo "Silvio Mora srl" · capogruppo SILVIO MORA SRL
with g as (insert into public.company_groups (name) values ('Silvio Mora srl') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('d3a5c519-f1eb-4905-957c-e40599e50961'::uuid, '5e289351-2438-4744-8487-588f79bc822e'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = 'd3a5c519-f1eb-4905-957c-e40599e50961'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = 'd3a5c519-f1eb-4905-957c-e40599e50961'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- innovativemedicine.jnj.com + jnj.com · Apollo "Johnson & Johnson" · capogruppo JOHNSON & JOHNSON
update public.companies set company_group_id = 'c11cccd3-aae6-4a87-8b02-354673826e0f'::uuid where id in ('edcb63a9-fbc2-4fd4-a5d0-31ff1465757d'::uuid, '64fd7a09-e711-41bc-a7b4-13ea93c2f993'::uuid) and company_group_id is null;
update public.company_groups set capogruppo_id = 'edcb63a9-fbc2-4fd4-a5d0-31ff1465757d'::uuid, capogruppo_deciso_il = now() where id = 'c11cccd3-aae6-4a87-8b02-354673826e0f'::uuid and capogruppo_id is null;

-- fondazionemolina.com + fondazionemolina.it · Apollo "Fondazione Molina" · capogruppo Fondazione Molina
with g as (insert into public.company_groups (name) values ('Fondazione Molina') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('689133fd-bb7a-4bc0-abc7-31daf850af4b'::uuid, 'e82276fd-af01-4a07-9b8e-6b71fc0642ba'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '689133fd-bb7a-4bc0-abc7-31daf850af4b'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '689133fd-bb7a-4bc0-abc7-31daf850af4b'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- alfaparfgroup.com + alfaparfmilano.com · Apollo "Alfaparf Milano" · capogruppo Alfaparf Milano
with g as (insert into public.company_groups (name) values ('Alfaparf Milano') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('72207517-7923-4a8b-b454-1799ccd764de'::uuid, '6b4dad65-44a1-4354-96a7-a6e79ab169a6'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '72207517-7923-4a8b-b454-1799ccd764de'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '72207517-7923-4a8b-b454-1799ccd764de'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- unilever.com + unilever.it · Apollo "Unilever" · capogruppo UNILEVER ITALIA MANUFACTURING SRL
with g as (insert into public.company_groups (name) values ('Unilever') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('e96c6fc4-2f4e-4a45-abae-f321a8932ccc'::uuid, '6fb49bc3-cd88-4015-a468-8e17e41d123a'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = 'e96c6fc4-2f4e-4a45-abae-f321a8932ccc'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = 'e96c6fc4-2f4e-4a45-abae-f321a8932ccc'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- jakin.ch + jakinmed.it · Apollo "Jakin SA" · capogruppo Jakin
with g as (insert into public.company_groups (name) values ('Jakin SA') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('839dacc5-c3a8-4a37-a5a6-6cbde68774dd'::uuid, '6ff2d0bf-c9f5-4d8b-8188-bf83ea00839b'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '839dacc5-c3a8-4a37-a5a6-6cbde68774dd'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '839dacc5-c3a8-4a37-a5a6-6cbde68774dd'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- smnovella.com + smnovella.it · Apollo "Officina Profumo-Farmaceutica di Santa Maria Novella" · capogruppo OFFICINA PROFUMO FARMACEUTICA DI SANTA MARIA NOVELLA S.P.A.
with g as (insert into public.company_groups (name) values ('Officina Profumo-Farmaceutica di Santa Maria Novella') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('76f93705-5efa-4fc1-80c9-54b4ba417d06'::uuid, 'd8fa6fbe-6412-436d-83cb-1d5e1d560591'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '76f93705-5efa-4fc1-80c9-54b4ba417d06'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '76f93705-5efa-4fc1-80c9-54b4ba417d06'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- coc.it + tubilux.it · Apollo "COC Farmaceutici" · capogruppo Coc
with g as (insert into public.company_groups (name) values ('COC Farmaceutici') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('b70cb7b0-afeb-4d35-9b34-7b9262564fe2'::uuid, '7a1f05b8-b3a8-49d4-96a9-dc8bb2ed55da'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = 'b70cb7b0-afeb-4d35-9b34-7b9262564fe2'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = 'b70cb7b0-afeb-4d35-9b34-7b9262564fe2'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- aptuit.com + evotec.com · Apollo "Evotec" · capogruppo APTUIT SRL
with g as (insert into public.company_groups (name) values ('Evotec') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('e51034e8-21a3-4feb-9fc6-7082a7962874'::uuid, '7e69582e-42c3-4228-ae4e-4ca1912b37aa'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = 'e51034e8-21a3-4feb-9fc6-7082a7962874'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = 'e51034e8-21a3-4feb-9fc6-7082a7962874'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- advaxia.com + advent-gmp.com · Apollo "Advaxia Biologics" · capogruppo ADVAXIA S.R.L.
with g as (insert into public.company_groups (name) values ('Advaxia Biologics') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('a8ab0ff8-8222-4bf8-8cbb-60f3bf538463'::uuid, '7f31f8b1-f409-4b20-af52-f9e409a988a1'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = 'a8ab0ff8-8222-4bf8-8cbb-60f3bf538463'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = 'a8ab0ff8-8222-4bf8-8cbb-60f3bf538463'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- airliquide.com + it.medicaldevice.airliquide.com · Apollo "Air Liquide" · capogruppo AIR LIQUIDE MEDICAL SYSTEMS S.R.L.
with g as (insert into public.company_groups (name) values ('Air Liquide') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('81dfdaa1-c90e-40bf-9b5c-92cd82ffbd59'::uuid, '81506c05-f299-4db6-804c-5157ab2bace9'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '81dfdaa1-c90e-40bf-9b5c-92cd82ffbd59'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '81dfdaa1-c90e-40bf-9b5c-92cd82ffbd59'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- opocrin.it + opocringroup.it · Apollo "OPOCRIN GROUP" · capogruppo Opocrin
with g as (insert into public.company_groups (name) values ('OPOCRIN GROUP') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('81df0ada-cc9e-410d-9cbf-ab4cb5a2755f'::uuid, 'daf2a488-8efc-43a8-a7e6-417104b0b254'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '81df0ada-cc9e-410d-9cbf-ab4cb5a2755f'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '81df0ada-cc9e-410d-9cbf-ab4cb5a2755f'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- z-cube.it + zambon.com · Apollo "Zambon" · capogruppo ZAMBON ITALIA S.R.L.
with g as (insert into public.company_groups (name) values ('Zambon') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('88e02144-dd08-41d7-a8fe-935c6a1fae6e'::uuid, 'eb7c23c6-1924-4b6c-9877-90f376d52d8c'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '88e02144-dd08-41d7-a8fe-935c6a1fae6e'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '88e02144-dd08-41d7-a8fe-935c6a1fae6e'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- incacosmetici.it + incacosmetics.com · Apollo "INCA Cosmetici Srl" · capogruppo INCA COSMETICI S.R.L.
with g as (insert into public.company_groups (name) values ('INCA Cosmetici Srl') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('8d2f3683-54e9-4677-a5e9-5ad1bd9f42ea'::uuid, 'd3d81e36-6321-4eba-b026-1d17f97ec7a1'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = '8d2f3683-54e9-4677-a5e9-5ad1bd9f42ea'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = '8d2f3683-54e9-4677-a5e9-5ad1bd9f42ea'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- docgenerici.it + docpharma.com · Apollo "DOC Pharma Official" · capogruppo DOC GENERICI Srl
with g as (insert into public.company_groups (name) values ('DOC Pharma Official') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('edce338e-e53b-44dd-ad50-ae857bca966e'::uuid, '927b6273-b7a3-49c6-813b-cfd5fc1cbb65'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = 'edce338e-e53b-44dd-ad50-ae857bca966e'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = 'edce338e-e53b-44dd-ad50-ae857bca966e'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- recordati.com + recordati.it · Apollo "Recordati" · capogruppo Recordati
with g as (insert into public.company_groups (name) values ('Recordati') returning id)
update public.companies c set company_group_id = g.id from g where c.id in ('fd90b138-f1c7-4201-9479-94c915dbff8c'::uuid, '997819a4-0dd0-49aa-a889-a26b6e448000'::uuid) and c.company_group_id is null;
update public.company_groups g set capogruppo_id = 'fd90b138-f1c7-4201-9479-94c915dbff8c'::uuid, capogruppo_deciso_il = now() from public.companies c where c.id = 'fd90b138-f1c7-4201-9479-94c915dbff8c'::uuid and g.id = c.company_group_id and g.capogruppo_id is null;

-- San Donato: sottodomini delle strutture.
insert into public.companies_siti_rimossi (company_id, nome, website_precedente, motivo)
select c.id, c.name, c.website, 'sottodominio del sito di Gruppo San Donato: le persone sono del gruppo'
from public.companies c
join public.apollo_people_scarico s on s.company_id = c.id
where s.dominio in ('beatomatteo.grupposandonato.it', 'smartdentalclinic.grupposandonato.it')
  and c.website is not null and c.is_active and c.merged_into is null
on conflict do nothing;
update public.companies c set website = null
from public.companies_siti_rimossi r
where r.company_id = c.id and c.website = r.website_precedente;
delete from public.apollo_people_raw     where company_id in (select company_id from public.companies_siti_rimossi);
delete from public.apollo_people_scarico where company_id in (select company_id from public.companies_siti_rimossi);
delete from public.company_workforce     where company_id in (select company_id from public.companies_siti_rimossi);
