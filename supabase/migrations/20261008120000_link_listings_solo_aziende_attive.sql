-- =============================================================================
-- link_listings_to_companies: solo aziende ATTIVE e non unite — 08/10/2026
-- =============================================================================
-- Diagnosi dell'import Vocations dell'08/10/2026: 90 annunci su 296 (e 162 in totale)
-- finivano su schede gia' unite o disattivate (es. "La farmacia" -> LABORATORIO DELLA
-- FARMACIA, "Chiesi Farmaceutici S.P.A." -> CHIESI ITALIA SPA), perche' la funzione
-- cercava per ragione sociale/nome su TUTTE le aziende, comprese quelle con merged_into
-- valorizzato o is_active=false. Gli annunci restavano cosi' invisibili sulla scheda
-- che sopravvive. Ora considera solo le aziende attive e non unite.
-- =============================================================================

create or replace function public.link_listings_to_companies()
returns table(linked integer, not_found integer)
language plpgsql
as $function$
declare
  v_linked integer := 0;
  v_not_found integer := 0;
  r record;
  v_company_id uuid;
begin
  for r in
    select distinct ragione_sociale
    from job_listings
    where ragione_sociale is not null
    and company_id is null
  loop
    v_company_id := null;

    -- Match esatto prima
    select id into v_company_id
    from companies
    where is_active is true and merged_into is null
      and (ragione_sociale ilike r.ragione_sociale or name ilike r.ragione_sociale)
    limit 1;

    -- Se non trova, prova con la prima parola significativa (min 4 chars)
    if v_company_id is null then
      select id into v_company_id
      from companies
      where is_active is true and merged_into is null
      and (
        ragione_sociale ilike '%' || split_part(r.ragione_sociale, ' ', 1) || '%'
        or name ilike '%' || split_part(r.ragione_sociale, ' ', 1) || '%'
      )
      and length(split_part(r.ragione_sociale, ' ', 1)) >= 4
      limit 1;
    end if;

    if v_company_id is not null then
      update job_listings
      set company_id = v_company_id
      where ragione_sociale = r.ragione_sociale
      and company_id is null;

      update companies
      set ragione_sociale = r.ragione_sociale
      where id = v_company_id
      and ragione_sociale is null;

      v_linked := v_linked + 1;
    else
      v_not_found := v_not_found + 1;
    end if;
  end loop;

  return query select v_linked, v_not_found;
end;
$function$;
