// Yahoo Finance per-ticker headline feed (up to 20 recent stories per stock).
// Unofficial feed, no published limit (docs/news-sources.md): one request every 14+ seconds,
// each company at most every 2 hours, staggered from Google. Any 429/403/503 → stop and back off.

const UA = "HYPR news collector (https://hyprai.netlify.app; contact via site)";
const PACE_MS = 14000;

class Blocked extends Error {}

const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]).trim() : ""; };

async function search(company) {
  const sym = company.ticker.replace("-", "-"); // Yahoo uses BRK-B
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if ([403, 429, 503].includes(res.status)) throw new Blocked(`Yahoo HTTP ${res.status}`);
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const xml = await res.text();
  return xml.split("<item>").slice(1).map(item => {
    const link = tag(item, "link");
    let source = "";
    try { source = new URL(link).hostname.replace(/^www\./, ""); } catch {}
    return {
      url: link, title: tag(item, "title"), summary: tag(item, "description") || null, source,
      published_at: tag(item, "pubDate") ? new Date(tag(item, "pubDate")).toISOString() : null, found_via: "yahoo",
    };
  });
}

module.exports = { name: "yahoo", PACE_MS, search, Blocked };
