-- Indice parziale su company_products.active_ingredients_norm — la query
-- "select active_ingredients_norm where active_ingredients_norm is not null"
-- faceva un Seq Scan su 288.606 righe (280.107 scartate dal filtro) per
-- restituirne solo 8.499, ~2.5s via connessione privilegiata e in timeout
-- via PostgREST (usata da loadIngredientiVocabolario() per scomporre i nomi
-- di principio attivo composti nel report concorrenti, 8/09/2026).
create index if not exists idx_company_products_active_ingredients_norm_not_null
  on public.company_products (id)
  where active_ingredients_norm is not null;
