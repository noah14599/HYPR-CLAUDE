-- HYPR database, step 5: group copies of the same story.
-- Two articles are the same story when they share a company, were published within 48 hours of each other,
-- and their headlines are at least 60% alike once lower-cased, de-punctuated and stripped of " - Publisher".
create extension if not exists pg_trgm;

create or replace function public.norm_title(t text) returns text
language sql immutable as $$
  select trim(regexp_replace(
    lower(regexp_replace(coalesce(t, ''), '\s[-|–—]\s[^-|–—]{2,40}$', '')),  -- drop a trailing " - Reuters" style suffix
    '[^a-z0-9]+', ' ', 'g'))
$$;

alter table public.news_articles add column if not exists title_norm text generated always as (public.norm_title(title)) stored;
create index if not exists news_articles_title_trgm_idx on public.news_articles using gin (title_norm gin_trgm_ops);

-- Gives every new article a story_id: the id of the earliest matching article, or its own id if it's the first.
create or replace function public.group_stories() returns integer
language plpgsql as $$
declare
  r record;
  sid bigint;
  n integer := 0;
begin
  perform set_config('pg_trgm.similarity_threshold', '0.6', true);
  for r in
    select a.id, a.title_norm, coalesce(a.published_at, a.found_at) as at
    from public.news_articles a
    where a.story_id is null
    order by a.id
    limit 5000
  loop
    select coalesce(b.story_id, b.id) into sid
    from public.news_articles b
    where b.id < r.id
      and b.title_norm % r.title_norm
      and coalesce(b.published_at, b.found_at) between r.at - interval '48 hours' and r.at + interval '48 hours'
      and exists (
        select 1 from public.news_article_tickers x
        join public.news_article_tickers y on y.ticker = x.ticker
        where x.article_id = r.id and y.article_id = b.id)
    order by similarity(b.title_norm, r.title_norm) desc, b.id
    limit 1;
    update public.news_articles set story_id = coalesce(sid, r.id) where id = r.id;
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke all on function public.group_stories() from public, anon, authenticated;
