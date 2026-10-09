// Minimal RSS/Atom reading shared by the feed-based sources.
export const UA = "HYPR news collector (https://hyprai.netlify.app)";

/** Thrown when a source refuses us (429/403/503). The collector stops that source and backs off. */
export class Blocked extends Error { constructor(m) { super(m); this.name = "Blocked"; } }

export const decode = s => (s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;|&#8217;|&#x27;/g, "'").replace(/&#8216;/g, "'").replace(/&#822[01];/g, '"')
  .replace(/&nbsp;|&#160;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/\s+/g, " ").trim();

export const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
};

export const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

export function items(xml) {
  const parts = xml.includes("<item") ? xml.split(/<item[\s>]/).slice(1) : xml.split(/<entry[\s>]/).slice(1);
  return parts.map(p => {
    const link = tag(p, "link") || (p.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "";
    const date = tag(p, "pubDate") || tag(p, "published") || tag(p, "updated") || tag(p, "dc:date");
    return {
      title: tag(p, "title"),
      link: link.replace(/&amp;/g, "&"),
      summary: tag(p, "description") || tag(p, "summary") || tag(p, "content:encoded") || null,
      published_at: date && !isNaN(Date.parse(date)) ? new Date(date).toISOString() : null,
      source_name: tag(p, "source"),
      source_url: (p.match(/<source url="([^"]+)"/) || [])[1] || "",
    };
  });
}

/** GET with an honest User-Agent; refusals become Blocked. Supports "only if changed" headers. */
export async function get(url, { etag, lastModified } = {}) {
  const headers = { "User-Agent": UA };
  if (etag) headers["If-None-Match"] = etag;
  if (lastModified) headers["If-Modified-Since"] = lastModified;
  const res = await fetch(url, { headers });
  if ([403, 429, 503].includes(res.status)) throw new Blocked(`${host(url)} HTTP ${res.status}`);
  if (res.status === 304) return { notModified: true };
  if (!res.ok) throw new Error(`${host(url)} HTTP ${res.status}`);
  return { text: await res.text(), etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified") };
}
