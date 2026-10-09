-- HYPR database, step 1: daily stock prices.
-- Applied by: npm --prefix pipeline run migrate

create table if not exists public.prices_daily (
  ticker     text    not null,          -- e.g. AAPL
  day        date    not null,          -- trading day
  open       numeric not null,
  high       numeric not null,
  low        numeric not null,
  close      numeric not null,
  volume     numeric not null,
  vwap       numeric,                   -- volume-weighted average price
  updated_at timestamptz not null default now(),
  primary key (ticker, day)
);

create index if not exists prices_daily_day_idx on public.prices_daily (day desc);

-- Locked by default (row level security); the website may only read.
alter table public.prices_daily enable row level security;

drop policy if exists "Anyone can read prices" on public.prices_daily;
create policy "Anyone can read prices" on public.prices_daily
  for select to anon, authenticated using (true);

grant select on public.prices_daily to anon, authenticated;
grant all on public.prices_daily to service_role;

-- Tell the API to pick up the new table right away.
notify pgrst, 'reload schema';
