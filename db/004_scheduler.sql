-- HYPR database, step 4: the always-on scheduler.
-- pg_cron runs jobs on a timetable inside the database; pg_net lets those jobs call our collector functions.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Where each collector left off in its round of companies, so every minute's run picks up the next batch.
create table if not exists public.collector_state (
  source     text primary key,
  next_index integer not null default 0,
  round      integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.collector_state enable row level security;
grant all on public.collector_state to service_role;

-- Per-feed "only if changed" markers (ETag / Last-Modified), so repeat checks cost almost nothing.
create table if not exists public.feed_cache (
  url           text primary key,
  etag          text,
  last_modified text,
  checked_at    timestamptz not null default now()
);
alter table public.feed_cache enable row level security;
grant all on public.feed_cache to service_role;

-- Duplicate grouping: a story is the earliest article it was grouped with.
create index if not exists news_articles_story_idx on public.news_articles (story_id);
create index if not exists news_articles_found_idx on public.news_articles (found_at desc);

-- Keep the free plan's 500 MB in check: drop stories older than 30 days (filings and prices are kept).
create or replace function public.prune_old_news() returns integer language sql as $$
  with gone as (delete from public.news_articles where coalesce(published_at, found_at) < now() - interval '30 days' returning 1)
  select count(*)::int from gone;
$$;
revoke all on function public.prune_old_news() from public, anon, authenticated;

notify pgrst, 'reload schema';
