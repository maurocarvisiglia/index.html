-- Stesso schema delle altre tabelle dell'app (companies, job_listings): RLS attiva + policy per il ruolo anon,
-- perche' la pagina lavora con la chiave anonima. Gli script con service role non sono toccati (bypassano la RLS).
alter table public.job_taxonomy enable row level security;
alter table public.job_aliases enable row level security;
alter table public.companies_blocklist enable row level security;
alter table public.company_groups enable row level security;

drop policy if exists "Allow all for anon" on public.job_taxonomy;
create policy "Allow all for anon" on public.job_taxonomy for all to anon using (true) with check (true);
drop policy if exists "Allow all for anon" on public.companies_blocklist;
create policy "Allow all for anon" on public.companies_blocklist for all to anon using (true) with check (true);
drop policy if exists "Allow all for anon" on public.company_groups;
create policy "Allow all for anon" on public.company_groups for all to anon using (true) with check (true);
