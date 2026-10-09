// Google News search feed: stories about a company from across the web.
// No published limit (docs/news-sources.md), so we go very slowly: one request every 14+ seconds,
// each company at most every 2 hours. Any 429/503 → stop this source and back off.

const UA = "HYPR news collector (https://hyprai.netlify.app; contact via site)";
const PACE_MS = 14000;

class Blocked extends Error {}

const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]).trim() : ""; };

function query(company) {
  const names = [...new Set(company.aliases.filter(a => a.length >= 3))].map(a => `"${a}"`);
  if (!company.ticker_strict) names.push(company.ticker.replace("-", "."));
  return `(${names.join(" OR ")}) when:1d`;
}

async function search(company) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query(company))}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429 || res.status === 503) throw new Blocked(`Google News HTTP ${res.status}`);
  if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
  const xml = await res.text();
  return xml.split("<item>").slice(1).map(item => {
    const source = tag(item, "source");
    const sourceUrl = (item.match(/<source url="([^"]+)"/) || [])[1] || "";
    let title = tag(item, "title");
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3)); // "Headline - Reuters"
    return {
      url: tag(item, "link"), // a news.google.com link that forwards to the article
      title,
      summary: null, // Google's description is just the headline again
      source: sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : source,
      published_at: tag(item, "pubDate") ? new Date(tag(item, "pubDate")).toISOString() : null,
      found_via: "google",
    };
  });
}

module.exports = { name: "google", PACE_MS, search, query, Blocked };
