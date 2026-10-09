// Press-release wires and outlets: one feed each, checked every 15 minutes with "only if changed" requests,
// every story filtered against all companies. Feeds that refused us (GlobeNewswire, Fierce Pharma) are left out.
import { get, items, host } from "./rss.mjs";

export const FEEDS = [
  { name: "PR Newswire", url: "https://www.prnewswire.com/rss/news-releases-list.rss" },
  { name: "Business Wire M&A", url: "https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeEFtRWA==" },
  { name: "CNBC Top News", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114" },
  { name: "CNBC Earnings", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839135" },
  { name: "CNBC Business", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147" },
  { name: "Motley Fool", url: "https://www.fool.com/feeds/index.aspx" },
  { name: "Benzinga", url: "https://www.benzinga.com/feed" },
  { name: "Investing.com Stocks", url: "https://www.investing.com/rss/news_25.rss" },
  { name: "Seeking Alpha Market Currents", url: "https://seekingalpha.com/market_currents.xml" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
];

/** Fetch one feed. Returns null if unchanged since last time. */
export async function readFeed(feed, cache) {
  const r = await get(feed.url, cache);
  if (r.notModified) return null;
  return {
    stories: items(r.text).map(i => ({ url: i.link, title: i.title, summary: i.summary, source: host(i.link), published_at: i.published_at, found_via: "feeds" })),
    etag: r.etag, lastModified: r.lastModified,
  };
}
