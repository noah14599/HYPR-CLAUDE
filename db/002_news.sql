-- HYPR database, step 2: companies, news articles, filings, and source health.
-- Applied by: npm --prefix pipeline run migrate

-- One row per company we track, with every name a news story might use for it.
create table if not exists public.companies (
  ticker        text primary key,          -- app ticker, e.g. BRK-B
  name          text not null,             -- official name, e.g. Apple Inc.
  aliases       text[] not null default '{}', -- other names stories use: Apple, Alphabet, Google, ...
  cik           text,                      -- SEC company ID
  ticker_strict boolean not null default false, -- ticker is short or a common word: only $T / (NYSE: T) style counts
  name_strict   boolean not null default false, -- name is a common word (Apple, Target): needs business context nearby
  updated_at    timestamptz not null default now()
);

-- One row per article, however many sources it came from.
create table if not exists public.news_articles (
  id           bigserial primary key,
  url          text not null unique,       -- cleaned link to the original article
  title        text not null,
  summary      text,                       -- short description from the feed, if any
  source       text not null,              -- publisher, e.g. reuters.com
  found_via    text not null,              -- which collector found it first: gdelt, google, sec, ...
  published_at timestamptz,
  found_at     timestamptz not null default now(),
  story_id     bigint                      -- set when grouped with copies of the same story
);
create index if not exists news_articles_published_idx on public.news_articles (published_at desc);

-- Which companies an article is about, and why we think so.
create table if not exists public.news_article_tickers (
  article_id bigint not null references public.news_articles(id) on delete cascade,
  ticker     text   not null references public.companies(ticker) on delete cascade,
  reason     text   not null,              -- e.g. "ticker $AAPL in title", "name Apple in summary"
  score      smallint not null,            -- higher = more clearly about this company
  primary key (article_id, ticker)
);
create index if not exists news_article_tickers_ticker_idx on public.news_article_tickers (ticker);

-- SEC filings, one row per filing.
create table if not exists public.filings (
  accession   text primary key,            -- SEC's filing number
  ticker      text not null references public.companies(ticker) on delete cascade,
  form        text not null,               -- 8-K, 10-Q, 10-K, 4, SC 13D, ...
  filed_at    timestamptz not null,
  items       text,                        -- 8-K item numbers, e.g. "2.02,9.01"
  description text,                        -- plain-English meaning of the form/items
  url         text not null
);
create index if not exists filings_ticker_idx on public.filings (ticker, filed_at desc);

-- Per-source health: when it last worked, what it found, and any back-off in force.
create table if not exists public.news_source_health (
  source        text primary key,
  last_ok_at    timestamptz,
  last_error_at timestamptz,
  last_error    text,
  backoff_until timestamptz,
  found_last    integer not null default 0,
  updated_at    timestamptz not null default now()
);

-- Locked by default; the website may read companies, articles and filings. Source health stays private.
alter table public.companies            enable row level security;
alter table public.news_articles        enable row level security;
alter table public.news_article_tickers enable row level security;
alter table public.filings              enable row level security;
alter table public.news_source_health   enable row level security;

drop policy if exists "Anyone can read companies" on public.companies;
create policy "Anyone can read companies" on public.companies for select to anon, authenticated using (true);
drop policy if exists "Anyone can read articles" on public.news_articles;
create policy "Anyone can read articles" on public.news_articles for select to anon, authenticated using (true);
drop policy if exists "Anyone can read article tickers" on public.news_article_tickers;
create policy "Anyone can read article tickers" on public.news_article_tickers for select to anon, authenticated using (true);
drop policy if exists "Anyone can read filings" on public.filings;
create policy "Anyone can read filings" on public.filings for select to anon, authenticated using (true);

grant select on public.companies, public.news_articles, public.news_article_tickers, public.filings to anon, authenticated;
grant all on public.companies, public.news_articles, public.news_article_tickers, public.filings, public.news_source_health to service_role;
grant usage, select on sequence public.news_articles_id_seq to service_role;

notify pgrst, 'reload schema';
