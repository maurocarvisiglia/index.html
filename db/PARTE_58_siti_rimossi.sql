-- =============================================================================
-- SITI RIMOSSI: 60 SCHEDE CON UN SITO CHE NON E' IL LORO — 28/09/2026
-- =============================================================================
-- Deciso da Mauro ("elimina i siti da queste aziende: andremo a ricercarli in
-- maniera diversa"). Apollo cerca le persone per dominio: con un sito di
-- piattaforma, di gruppo o della capogruppo, ogni scheda riceveva le persone di
-- un'altra organizzazione.
--   lafarmacia.it       34 farmacie  (resta LABORATORIO DELLA FARMACIA: e' la sua homepage)
--   gvmnet.it            9 ospedali GVM
--   grupposandonato.it   4 istituti   (resta Gruppo San Donato: e' il suo sito)
--   ghcspa.com 3 · kormed.it 2 · grupposynergo.com 2 · pfizer.it 2 (Hospira, Wyeth)
--   sanofi.it 2 (Genzyme, Opella) · cfm-group.it 2 (A.M.S.A., COSMA)
--
-- Il vecchio indirizzo resta in companies_siti_rimossi, cosi' la nuova ricerca
-- sa quale sito NON riproporre. Le persone scaricate da quei siti si
-- cancellano: erano di altre organizzazioni, e dove c'e' un titolare giusto
-- (Gruppo San Donato) ne conserva la sua copia. La scheda rientra nella
-- raccolta Apollo appena ha un sito nuovo.
-- =============================================================================

create table if not exists public.companies_siti_rimossi (
  company_id          uuid not null references public.companies(id) on delete cascade,
  nome                text not null,
  website_precedente  text not null,
  motivo              text not null,
  rimosso_il          timestamptz not null default now(),
  primary key (company_id, website_precedente)
);
alter table public.companies_siti_rimossi enable row level security;
revoke all on public.companies_siti_rimossi from anon, authenticated;
grant select on public.companies_siti_rimossi to anon, authenticated;
create policy "siti_rimossi_lettura" on public.companies_siti_rimossi for select using (true);

insert into public.companies_siti_rimossi (company_id, nome, website_precedente, motivo)
select v.id, v.nome, v.sito, v.motivo
from (values
  ('00095006-aed4-4d49-81c7-6963902a9cb0'::uuid, 'Lafarmaciapunto | B Corp', 'https://www.lafarmacia.it/trova-farmacia/perini-selvazzano-dentro', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('78a3edb1-edf6-423e-8a9c-976ffe7dd4be'::uuid, 'Clinica Sant’Elena – Quartu Sant’Elena', 'https://www.kormed.it/strutture/casa-di-cura-polispecialistica-santelena-kinetika/', 'pagina del sito di gruppo Kormed: Apollo restituisce ISAV'),
  ('737bf13a-2e3f-4c1e-afbf-a1c587d9fadc'::uuid, 'Clinica San Francesco – Verona', 'https://www.ghcspa.com/en/clinicasanfrancesco', 'pagina del sito di gruppo GHC: Apollo restituisce HESPERIA HOSPITAL MODENA'),
  ('5dd2baa0-911a-4baf-9439-c6867fc830ce'::uuid, 'Istituto Clinico San Rocco – Ome', 'https://www.grupposandonato.it/strutture/istituto-clinico-san-rocco', 'pagina del sito di Gruppo San Donato: le persone sono del gruppo'),
  ('16a5f141-107d-4862-aa9c-97f263a1fb9b'::uuid, 'Nigrisoli – Bologna', 'www.ghcspa.com/en/ospedaliprivatiriuniti/the-opr-hospital/nigrisoli-hospital', 'pagina del sito di gruppo GHC: Apollo restituisce HESPERIA HOSPITAL MODENA'),
  ('f134a795-12f4-44af-8e0e-108d437486ec'::uuid, 'Villa Torri Hospital', 'https://www.gvmnet.it/strutture/villa-torri-hospital-bologna/home', 'pagina del sito di gruppo GVM: Apollo restituisce le persone di GVM Care & Research'),
  ('e1f055f3-fa0b-41be-aafe-d26b4c7a2ec2'::uuid, 'Lafarmacia.alconsiglio', 'https://www.lafarmacia.it/trova-farmacia/al-consiglio-gravedona-ed-uniti', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('5756d2ac-b4eb-4264-97f3-e6cc0569d12b'::uuid, 'Farmacia fumarola', 'https://www.lafarmacia.it/trova-farmacia/fumarola-mondolfo', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('c0248ac8-3008-4f3c-91a4-8a72cd288a67'::uuid, 'Clinica Privata Villalba', 'https://www.gvmnet.it/strutture/clinica-privata-villalba-bologna/home', 'pagina del sito di gruppo GVM: Apollo restituisce le persone di GVM Care & Research'),
  ('04aefdcb-12b2-4545-87c1-2b0403d8bab5'::uuid, 'Clinica San Camillo – Forte dei Marmi', 'https://www.kormed.it/strutture/casa-di-cura-san-camillo-hospital/', 'pagina del sito di gruppo Kormed: Apollo restituisce ISAV'),
  ('8db528aa-534b-4ba2-bc53-8080f275a334'::uuid, 'Villa Lucia Hospital – Conversano', 'https://www.gvmnet.it/strutture/villa-lucia-hospital-conversano/home', 'pagina del sito di gruppo GVM: Apollo restituisce le persone di GVM Care & Research'),
  ('8703e848-7729-4489-8e6f-26b5d5f02fb1'::uuid, 'Farmacia centrale', 'https://www.lafarmacia.it/trova-farmacia/centrale-marchesin-cologna-veneta', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('1cbbf47e-0c0d-4b43-bf0f-f86aae35c4ce'::uuid, 'HOSPIRA S.P.A.', 'https://www.pfizer.it', 'sito della capogruppo Pfizer, non della controllata'),
  ('88dd9ed4-58a6-4b27-884c-09aca253d301'::uuid, 'Farmacia bernardini', 'https://www.lafarmacia.it/trova-farmacia/bernardini-gravellona-toce', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('901499d2-f501-462a-8176-ab8253552ee4'::uuid, 'Farmacia collovini', 'https://www.lafarmacia.it/trova-farmacia/collovini-roncade', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('34945655-5b37-4ee7-8cbf-134219eaae8a'::uuid, 'Farmacia cocchi', 'https://www.lafarmacia.it/trova-farmacia/cocchi-pistoia', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('603eecda-bfaa-4530-913b-241fbc93a4e6'::uuid, 'Farmacia bertolani', 'https://www.lafarmacia.it/trova-farmacia/bertolani-scandicci', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('1ac29fc3-d217-4ebe-b71c-2496d436d24b'::uuid, 'Farmacia santa caterina', 'https://www.lafarmacia.it/trova-farmacia/santa-caterina-milano', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('6867324c-6d86-4f88-9b5c-3eb5540199f2'::uuid, 'Farmacia di biumo', 'https://www.lafarmacia.it/trova-farmacia/biumo-varese', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('3cbb0f8b-309d-4b9f-ad55-ea018e2fa8ec'::uuid, 'Farmacia fumagalli', 'https://www.lafarmacia.it/trova-farmacia/fumagalli-filago', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('27b8d5b8-3bf1-47b7-b758-b9ddcbc877f6'::uuid, 'Farmacia ghiselli', 'https://www.lafarmacia.it/trova-farmacia/ghiselli-castel-bolognese', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('3cbe4fc2-2b46-4bee-a688-a78c9ad66891'::uuid, 'Filippini', 'https://www.lafarmacia.it/trova-farmacia/filippini-carbonate', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('d44fb74f-85d9-4fb8-bb3b-6def53cef830'::uuid, 'Lafarmacia.dellaroggia', 'https://www.lafarmacia.it/trova-farmacia/della-roggia-ala', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('1c96aa16-4cf0-4ee8-8801-7776bb8aded8'::uuid, 'Farmacia internazionale', 'https://www.lafarmacia.it/trova-farmacia/internazionale-sestri-sestri-levante', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('99f50c88-6451-4dbf-a000-38c44d628eb3'::uuid, 'Opella healthcare italy', 'http://www.sanofi.it/', 'sito della capogruppo Sanofi, non della controllata'),
  ('5b8a918c-61e2-4d9a-a825-e90e7fcb56db'::uuid, 'Farmacia trepponti', 'https://www.lafarmacia.it/trova-farmacia/trepponti-comacchio', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('b2cadf7a-8fac-48b5-8510-aaf909aff07f'::uuid, 'COSMA - S.P.A.', 'https://www.cfm-group.it/cosma/', 'sito di un altro gruppo: Apollo restituisce Clarochem Ireland'),
  ('58da5c03-20d2-46ca-9c98-c0f707b4a8e1'::uuid, 'Istituto Clinico Spatocco – Chieti', 'https://www.grupposynergo.com/casa-di-cura-spatocco-contatti/', 'sito di gruppo Synergo: Apollo restituisce Casa di Cura Pierangeli'),
  ('303b1af9-129f-4722-b2dd-af02a43c228d'::uuid, 'Istituto Clinico San Siro', 'https://www.grupposandonato.it/strutture/istituto-clinico-san-siro', 'pagina del sito di Gruppo San Donato: le persone sono del gruppo'),
  ('3edc2488-a446-4b7a-a530-402e065d94a3'::uuid, 'Villa Nigrisoli – Bologna', 'https://www.ghcspa.com/en/ospedaliprivatiriuniti/the-opr-hospital/nigrisoli-hospital', 'pagina del sito di gruppo GHC: Apollo restituisce HESPERIA HOSPITAL MODENA'),
  ('d21e543e-e16d-4f60-9d49-02094b36fa23'::uuid, 'Farmacia alla madonna', 'https://www.lafarmacia.it/trova-farmacia/alla-madonna-castelfranco-veneto', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('e11643c1-0a1b-4d5c-81eb-5493d658e3f4'::uuid, 'Farmacia dubbini', 'https://www.lafarmacia.it/trova-farmacia/dubbini-ancona', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('e942a2f1-31d4-4bb0-aedb-6a1bdd2953db'::uuid, 'Farmacia giovanni xxiii', 'https://www.lafarmacia.it/trova-farmacia/giovanni-xxiii-san-giovanni-lupatoto', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('75ec37fb-279d-404b-8c26-ec671c2d54f2'::uuid, 'A.M.S.A. ANONIMA MATERIE SINTETICHE E AFFINI S.P.A.', 'https://www.cfm-group.it/', 'sito di un altro gruppo: Apollo restituisce Clarochem Ireland'),
  ('90b500ad-f732-4a2b-9436-f17162dbf331'::uuid, 'Farmacia san pio x', 'https://www.lafarmacia.it/trova-farmacia/san-pio-x-rovigo', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('5d3bc0a0-3e58-460d-b5c0-6d9067d03e6c'::uuid, 'Farmacia salgari', 'https://www.lafarmacia.it/trova-farmacia/salgari-milano', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('abd3963f-ac85-420a-8eec-d2bba9fcd8db'::uuid, 'Farmacia dezza', 'https://www.lafarmacia.it/trova-farmacia/dezza-melegnano', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('fc7e003b-5333-4f18-a0cb-88416a6bdd39'::uuid, 'Farmacia schibuola', 'https://www.lafarmacia.it/trova-farmacia/schibuola-forli', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('d9f7236d-7b6b-47f6-b42a-7aebc7d8c382'::uuid, 'Farmacia villongo', 'https://www.lafarmacia.it/trova-farmacia/villongo', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('0d4618d5-9d0b-40f3-9015-703ece41aebf'::uuid, 'Beata vergine di san luca', 'https://www.lafarmacia.it/trova-farmacia/beata-vergine-di-san-luca-bologna', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('20c4a227-30d8-4976-a24d-89d3da42d44f'::uuid, 'Farmacia città studi', 'https://www.lafarmacia.it/trova-farmacia/citta-studi-milano', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('27eec8a1-cd3e-4957-8299-cb8d199e0b33'::uuid, 'Farmacia san marco', 'https://www.lafarmacia.it/trova-farmacia/san-marco-martellago', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('772a49c6-a79b-4f64-8ba9-2a4dc532004d'::uuid, 'Farmacia grandi', 'https://www.lafarmacia.it/trova-farmacia/grandi-trento', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('1f9d5972-af46-4923-a966-67f0b6338595'::uuid, 'Farmacia liprandi', 'https://www.lafarmacia.it/trova-farmacia/liprandi-asti', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('6432c4fd-8b18-4344-8041-d458978bb045'::uuid, 'Farmacia san giuseppe', 'https://www.lafarmacia.it/trova-farmacia/san-giuseppe-binasco-binasco', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('25384ebc-f62d-4ed2-b969-6526b14fea0e'::uuid, 'Farmacia besurica', 'https://www.lafarmacia.it/trova-farmacia/besurica-piacenza', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('114b11e4-c363-4450-a442-c4f7acb672ee'::uuid, 'Ospedale Santa Maria – Bari', 'https://www.gvmnet.it/strutture/ospedale-santa-maria-bari/home', 'pagina del sito di gruppo GVM: Apollo restituisce le persone di GVM Care & Research'),
  ('ee3f9a3b-5fba-492c-bc90-fad016b3565d'::uuid, 'WYETH LEDERLE SRL', 'https://www.pfizer.it', 'sito della capogruppo Pfizer, non della controllata'),
  ('478c046a-2ea5-4127-b15d-70d9c449f492'::uuid, 'Villa Maria Cecilia Hospital', 'https://www.gvmnet.it/strutture/maria-cecilia-hospital-cotignola/home', 'pagina del sito di gruppo GVM: Apollo restituisce le persone di GVM Care & Research'),
  ('9d9b4240-3a93-42dd-8171-f33f40145949'::uuid, 'Casa di Cura Villa Tiberia', 'https://www.gvmnet.it/strutture/villa-tiberia-hospital-roma/home', 'pagina del sito di gruppo GVM: Apollo restituisce le persone di GVM Care & Research'),
  ('08e9829c-6118-4ac0-816e-ad2e4232089a'::uuid, 'Città di Lecce Hospital', 'https://www.gvmnet.it/strutture/citta-di-lecce-hospital/', 'pagina del sito di gruppo GVM: Apollo restituisce le persone di GVM Care & Research'),
  ('8c7af34a-d0b7-44d1-8fc7-92f5a35405ae'::uuid, 'Farmacia cobelli', 'https://www.lafarmacia.it/trova-farmacia/cobelli-rovereto', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('56158b88-6df6-4339-a9ec-6fef081615cf'::uuid, 'Istituto Clinico Città di Brescia', 'https://www.grupposandonato.it/strutture/istituto-clinico-citta-di-brescia', 'pagina del sito di Gruppo San Donato: le persone sono del gruppo'),
  ('adef8a02-dbf1-4b94-b6db-e4becaef03b2'::uuid, 'Genzyme Europe B.V.', 'https://www.sanofi.it', 'sito della capogruppo Sanofi, non della controllata'),
  ('f8adb3f5-f32a-4b84-970c-39073a8bce14'::uuid, 'Farmacia internazionale alla salute', 'https://www.lafarmacia.it/trova-farmacia/internazionale-alla-salute-venezia', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('e4d310f2-6ef8-4172-8e79-d378d5ae7b79'::uuid, 'Clinica Santa Caterina da Siena – Torino', 'https://www.gvmnet.it/strutture/clinica-santa-caterina-da-siena/home', 'pagina del sito di gruppo GVM: Apollo restituisce le persone di GVM Care & Research'),
  ('4771e360-510e-47ac-84cc-a5c3e76a762a'::uuid, 'Istituto Clinico Sant''Anna – Torino', 'https://www.grupposandonato.it/strutture/istituto-clinico-sant-anna', 'pagina del sito di Gruppo San Donato: le persone sono del gruppo'),
  ('2dabb76c-58f9-4836-9063-d9cf46ee1277'::uuid, 'FEDERFARMA.CO DISTRIBUZIONE E SERVIZI IN FARMACIA S.P.A.', 'https://www.lafarmacia.it/trova-farmacia/fontana-trento', 'pagina della piattaforma lafarmacia.it: Apollo restituisce le persone di Farmacia Ninci'),
  ('a512fd82-8add-41aa-913b-52fe063e7dfd'::uuid, 'Anthea Hospital – GVM', 'https://www.gvmnet.it/strutture/anthea-hospital-bari/home', 'pagina del sito di gruppo GVM: Apollo restituisce le persone di GVM Care & Research'),
  ('c9e962f6-c236-4e0b-8771-b19622206fc3'::uuid, 'Casa di Cura Spatocco – Chieti', 'www.grupposynergo.com', 'sito di gruppo Synergo: Apollo restituisce Casa di Cura Pierangeli')
) as v(id, nome, sito, motivo)
join public.companies c on c.id = v.id and c.website = v.sito
on conflict do nothing;

-- Solo le schede il cui sito e' ancora quello annotato (se nel frattempo e' stato
-- corretto a mano, non si tocca).
update public.companies c set website = null
from public.companies_siti_rimossi r
where r.company_id = c.id and c.website = r.website_precedente;

delete from public.apollo_people_raw     where company_id in (select company_id from public.companies_siti_rimossi);
delete from public.apollo_people_scarico where company_id in (select company_id from public.companies_siti_rimossi);
delete from public.company_workforce     where company_id in (select company_id from public.companies_siti_rimossi);
