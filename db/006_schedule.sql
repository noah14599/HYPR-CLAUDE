-- HYPR database, step 6: the timetable. pg_cron runs each job inside the database; collector jobs call the
-- "collect" function with the private password kept in Supabase Vault (secrets "project_url" and "cron_secret",
-- created by pipeline/setup-schedule.js, never stored in this repo).
-- Paces stay inside each source's limits (docs/news-sources.md).

create or replace function public.call_collector(source text) returns bigint
language sql security definer set search_path = public, extensions as $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/collect?source=' || source,
    headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 140000
  );
$$;
revoke all on function public.call_collector(text) from public, anon, authenticated;

-- Replace any earlier versions of these jobs.
do $$
declare j text;
begin
  foreach j in array array['hypr-google', 'hypr-yahoo', 'hypr-finnhub', 'hypr-feeds', 'hypr-sec', 'hypr-group', 'hypr-prune', 'hypr-cleanup'] loop
    if exists (select 1 from cron.job where jobname = j) then perform cron.unschedule(j); end if;
  end loop;
end $$;

select cron.schedule('hypr-google',  '* * * * *',    $$ select public.call_collector('google') $$);   -- 4 companies/min, 14 s apart
select cron.schedule('hypr-yahoo',   '* * * * *',    $$ select public.call_collector('yahoo') $$);    -- 4 companies/min, 14 s apart
select cron.schedule('hypr-finnhub', '* * * * *',    $$ select public.call_collector('finnhub') $$);  -- 40 companies/min (limit 60)
select cron.schedule('hypr-sec',     '* * * * *',    $$ select public.call_collector('sec') $$);      -- 1 request/min (limit 10/s)
select cron.schedule('hypr-feeds',   '*/10 * * * *', $$ select public.call_collector('feeds') $$);    -- each feed every 10 min
select cron.schedule('hypr-group',   '*/5 * * * *',  $$ select public.group_stories() $$);            -- group duplicate stories
select cron.schedule('hypr-prune',   '15 8 * * *',   $$ select public.prune_old_news() $$);           -- daily: drop news older than 30 days
select cron.schedule('hypr-cleanup', '30 8 * * *',   $$ delete from cron.job_run_details where end_time < now() - interval '3 days' $$);
