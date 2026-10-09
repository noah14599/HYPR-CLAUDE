// Sources searched one company at a time. Paces come from docs/news-sources.md.
import { get, items, host, Blocked } from "./rss.mjs";

const env = k => (globalThis.Deno ? Deno.env.get(k) : process.env[k]);

// Google News search feed: no published limit, so one request every 14 s; ~100 stories max per search.
export const google = {
  name: "google",
  paceMs: 14000,
  perRun: 4, // 4 × 14 s fits in one scheduled run; all 503 companies every ~2 hours
  async search(c) {
    const names = [...new Set(c.aliases.filter(a => a.length >= 3))].map(a => `"${a}"`);
    if (!c.ticker_strict) names.push(c.ticker.replace("-", "."));
    const q = `(${names.join(" OR ")}) when:1d`;
    const { text } = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`);
    return items(text).map(i => {
      let title = i.title;
      if (i.source_name && title.endsWith(" - " + i.source_name)) title = title.slice(0, -(i.source_name.length + 3));
      return { url: i.link, title, summary: null, source: host(i.source_url) || i.source_name, published_at: i.published_at, found_via: "google" };
    });
  },
};

// Yahoo Finance per-ticker feed: unofficial, no published limit; same slow pace, staggered from Google.
export const yahoo = {
  name: "yahoo",
  paceMs: 14000,
  perRun: 4,
  async search(c) {
    const { text } = await get(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(c.ticker)}&region=US&lang=en-US`);
    return items(text).map(i => ({ url: i.link, title: i.title, summary: i.summary, source: host(i.link), published_at: i.published_at, found_via: "yahoo" }));
  },
};

// Finnhub company news: free plan allows 60 calls/minute; we use 40 per run, 1.2 s apart (~50/minute at most).
export const finnhub = {
  name: "finnhub",
  paceMs: 1200,
  perRun: 40,
  async search(c) {
    const key = env("FINNHUB_API_KEY");
    if (!key) throw new Error("FINNHUB_API_KEY not set");
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
    const res = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(c.ticker.replace("-", "."))}&from=${from}&to=${to}&token=${key}`);
    if (res.status === 429 || res.status === 403) throw new Blocked(`Finnhub HTTP ${res.status}`);
    if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);
    const arr = await res.json();
    return (Array.isArray(arr) ? arr : []).map(a => ({
      url: a.url, title: a.headline, summary: a.summary || null, source: host(a.url) || a.source,
      published_at: a.datetime ? new Date(a.datetime * 1000).toISOString() : null, found_via: "finnhub",
    }));
  },
};
