// Re-runs the current relevance and junk filters over every saved story, so filter improvements also clean up
// the past: company links that no longer pass are removed, and stories left with no company (or junk) are deleted.
//   npm run recheck-news
const { connect } = require("./db");
const { compile, matchAll, isJunk } = require("./relevance");

(async () => {
  const db = connect();
  await db.connect();
  const companies = (await db.query("select ticker, name, aliases, cik, ticker_strict, name_strict from public.companies")).rows.map(compile);
  const arts = (await db.query("select id, title, summary, url, source from public.news_articles")).rows;
  const links = (await db.query("select article_id, ticker from public.news_article_tickers")).rows;
  const linked = new Map();
  for (const l of links) (linked.get(l.article_id) || linked.set(l.article_id, new Set()).get(l.article_id)).add(l.ticker);

  const deleteArticles = [], dropLinks = [];
  for (const a of arts) {
    if (isJunk(a.title, a.url, a.source)) { deleteArticles.push(a.id); continue; }
    const keep = new Set(matchAll(companies, a.title, a.summary).map(m => m.ticker));
    const have = linked.get(a.id) || new Set();
    const stay = [...have].filter(t => keep.has(t));
    if (!stay.length) { deleteArticles.push(a.id); continue; }
    for (const t of have) if (!keep.has(t)) dropLinks.push([a.id, t]);
  }
  if (dropLinks.length) {
    await db.query("delete from public.news_article_tickers t using unnest($1::bigint[], $2::text[]) as d(id, tk) where t.article_id = d.id and t.ticker = d.tk",
      [dropLinks.map(d => d[0]), dropLinks.map(d => d[1])]);
  }
  if (deleteArticles.length) await db.query("delete from public.news_articles where id = any($1)", [deleteArticles]);
  console.log(`checked ${arts.length} stories · removed ${deleteArticles.length} stories · removed ${dropLinks.length} company links`);
  await db.end();
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
