-- HYPR database, step 7: some links (Google's especially) are too long for a direct "no duplicates" index.
-- Compare links by a short fingerprint (md5) instead.
alter table public.news_articles add column if not exists url_hash text generated always as (md5(url)) stored;
alter table public.news_articles drop constraint if exists news_articles_url_key;
create unique index if not exists news_articles_url_hash_key on public.news_articles (url_hash);

create or replace function public.save_articles(items jsonb)
returns table (url text, id bigint, is_new boolean)
language sql
as $$
  with input as (
    select distinct on (x.url) x.*
    from jsonb_to_recordset(items) as x(url text, title text, summary text, source text, found_via text, published_at timestamptz)
  ),
  ins as (
    insert into public.news_articles (url, title, summary, source, found_via, published_at)
    select i.url, i.title, i.summary, i.source, i.found_via, i.published_at from input i
    on conflict (url_hash) do nothing
    returning news_articles.url, news_articles.id
  )
  select ins.url, ins.id, true from ins
  union all
  select a.url, a.id, false from public.news_articles a join input i on a.url_hash = md5(i.url);
$$;

notify pgrst, 'reload schema';
