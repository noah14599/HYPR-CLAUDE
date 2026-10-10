-- HYPR database, step 9: company facts — key stats, financial statements, profile, dividends, analyst ratings.
-- Filled around the clock by the "facts" collector (supabase/functions/_shared/facts/). Every source keeps its own
-- timestamp so the site can say how fresh each number is. Price-based numbers (market cap, P/E…) are not stored:
-- the website works them out from the live price, so they move with the stock.
create table if not exists public.company_facts (
  ticker          text primary key references public.companies(ticker) on delete cascade,
  profile         jsonb,        -- Massive: description, employees, address, website, industry, listed since, shares
  financials      jsonb,        -- SEC: quarters (10 years), years (15), trailing twelve months
  dividends       jsonb,        -- Massive: recent dividends
  short_interest  jsonb,        -- Massive (FINRA): latest short interest
  metrics         jsonb,        -- Finnhub: beta, forward P/E, PEG
  analysts        jsonb,        -- Finnhub: buy/hold/sell counts by month
  earnings        jsonb,        -- Finnhub: next report date + estimates, recent results vs estimates
  sources         jsonb not null default '{}', -- per source: when it last succeeded / its last error
  sec_filed       text,         -- newest SEC filing date included in financials
  updated_at      timestamptz
);
alter table public.company_facts enable row level security;
drop policy if exists "anyone can read company facts" on public.company_facts;
create policy "anyone can read company facts" on public.company_facts for select to anon, authenticated using (true);

-- Which companies to refresh next: ones that just filed results come first, then whoever was refreshed longest ago.
create or replace function public.facts_due(n int) returns table (ticker text)
language sql stable security definer set search_path = public as $$
  select c.ticker
  from public.companies c
  left join public.company_facts f on f.ticker = c.ticker
  order by
    exists (
      select 1 from public.filings x
      where x.ticker = c.ticker and x.filed_at > coalesce(f.updated_at, 'epoch')
        and (x.form in ('10-K', '10-Q', '10-K/A', '10-Q/A') or x.items like '%2.02%')
    ) desc,
    f.updated_at nulls first,
    c.ticker
  limit n;
$$;
revoke all on function public.facts_due(int) from public, anon, authenticated;
grant execute on function public.facts_due(int) to service_role;

-- Run the facts collector every minute (3 companies a run → every company about every 3 hours, sooner after results).
do $$ begin
  if exists (select 1 from cron.job where jobname = 'hypr-facts') then perform cron.unschedule('hypr-facts'); end if;
end $$;
select cron.schedule('hypr-facts', '* * * * *', $$ select public.call_collector('facts') $$);

notify pgrst, 'reload schema';
