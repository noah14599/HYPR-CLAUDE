-- HYPR database, step 8: what the website shows in each stock's News card.
-- One row per story per company (copies grouped), represented by the first article found, with how many
-- outlets carried it. security_invoker: the website's read permissions on the underlying tables apply.
create or replace view public.ticker_stories with (security_invoker = true) as
select distinct on (t.ticker, coalesce(a.story_id, a.id))
  t.ticker,
  coalesce(a.story_id, a.id)                as story_id,
  a.title,
  a.url,
  a.source,
  a.summary,
  coalesce(a.published_at, a.found_at)      as published_at,
  t.score,
  (select count(distinct b.source) from public.news_articles b
    where coalesce(b.story_id, b.id) = coalesce(a.story_id, a.id)) as outlets
from public.news_article_tickers t
join public.news_articles a on a.id = t.article_id
order by t.ticker, coalesce(a.story_id, a.id), a.id;

grant select on public.ticker_stories to anon, authenticated;

notify pgrst, 'reload schema';
