-- HYPR database, step 3: save a batch of news articles in one call and get back each one's id.
-- New links are inserted; links we already have keep their first version. Used by pipeline/news-store.js.
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
    on conflict on constraint news_articles_url_key do nothing
    returning news_articles.url, news_articles.id
  )
  select ins.url, ins.id, true from ins
  union all
  -- rows that already existed (the insert above isn't visible to this part of the same statement)
  select a.url, a.id, false from public.news_articles a join input i on i.url = a.url;
$$;

revoke all on function public.save_articles(jsonb) from public, anon, authenticated;
grant execute on function public.save_articles(jsonb) to service_role;

notify pgrst, 'reload schema';
