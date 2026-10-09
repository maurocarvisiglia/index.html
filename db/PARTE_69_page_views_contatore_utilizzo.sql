-- Contatore di utilizzo delle pagine: una riga per apertura di pagina (view_name = id della vista, es. 'ruolo').
create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  view_name text not null,
  user_email text,
  user_role text
);
create index if not exists page_views_created_at_idx on public.page_views (created_at desc);
alter table public.page_views enable row level security;
-- stesso schema delle altre tabelle dell'app: la pagina lavora con la chiave anonima
drop policy if exists "page_views anon insert" on public.page_views;
create policy "page_views anon insert" on public.page_views for insert to anon with check (true);
drop policy if exists "page_views anon select" on public.page_views;
create policy "page_views anon select" on public.page_views for select to anon using (true);
