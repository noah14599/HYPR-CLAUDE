-- HYPR database, step 10: table permissions for company facts (new tables don't get them automatically).
-- The collector (service role) writes; the website (anon) only reads, through the read policy in step 9.
grant select, insert, update, delete on public.company_facts to service_role;
grant select on public.company_facts to anon, authenticated;
notify pgrst, 'reload schema';
