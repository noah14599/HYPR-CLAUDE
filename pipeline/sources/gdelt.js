// GDELT DOC 2.0 API: searches thousands of news outlets worldwide by company name.
// Free for any use, including commercial, with credit and a link to https://www.gdeltproject.org/ (see docs/news-sources.md).
// Limit: about one request every 5 seconds; 250 articles per search.

const BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const UA = "HYPR news collector (https://hyprai.netlify.app)";
const PACE_MS = 6000; // a little slower than their 5-second guidance

const sleep = ms => new Promise(r => setTimeout(r, ms));

// GDELT wants quoted phrases; very short words are rejected, and acronyms like "AMD" are better left to the ticker.
function query(company) {
  const terms = [...new Set(company.aliases.filter(a => a.length >= 4).map(a => a.replace(/["()]/g, "")))];
  if (!terms.length) terms.push(company.name);
  const body = terms.map(t => `"${t}"`).join(" OR ");
  return (terms.length > 1 ? `(${body})` : body) + " sourcelang:english";
}

// "20261009T183000Z" → ISO time
const when = s => s && s.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z");

async function search(company, timespan = "24h") {
  const url = `${BASE}?query=${encodeURIComponent(query(company))}&mode=artlist&format=json&maxrecords=250&sort=datedesc&timespan=${timespan}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429) { await sleep(PACE_MS * 3 * attempt); continue; }
    if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);
    const text = await res.text();
    if (!text.trim().startsWith("{")) throw new Error("GDELT said: " + text.slice(0, 120).trim()); // e.g. query errors come back as plain text
    const json = JSON.parse(text);
    return (json.articles || []).map(a => ({
      url: a.url, title: a.title, summary: null, source: a.domain, published_at: when(a.seendate), found_via: "gdelt",
    }));
  }
  throw new Error("GDELT kept rate-limiting");
}

module.exports = { name: "gdelt", PACE_MS, search, query };
