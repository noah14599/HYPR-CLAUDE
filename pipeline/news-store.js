// Saves collected stories to Supabase (web API + secret key, so it runs anywhere) and keeps source health.
const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL_BASE || !SECRET) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");

const H = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" };

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`Supabase ${init.method || "GET"} ${path.split("?")[0]}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Same article, different tracking codes → one link.
function cleanUrl(u) {
  try {
    const x = new URL(u);
    x.hash = "";
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|cmpid|ref$|src$|ncid|guccounter)/i.test(k)) x.searchParams.delete(k);
    let s = x.toString();
    if (s.endsWith("/") && x.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch { return u; }
}

/**
 * Save stories and their company matches.
 * items: [{ url, title, summary, source, published_at, found_via, matches: [{ ticker, score, reason }] }]
 * Returns how many stories were new.
 */
async function saveArticles(items) {
  const rows = [];
  const byUrl = new Map();
  for (const it of items) {
    if (!it.url || !it.title || !it.matches?.length) continue;
    const url = cleanUrl(it.url);
    if (byUrl.has(url)) { byUrl.get(url).matches.push(...it.matches); continue; }
    const row = { url, title: it.title.trim().slice(0, 500), summary: it.summary ? it.summary.trim().slice(0, 2000) : null,
      source: it.source, found_via: it.found_via, published_at: it.published_at || null };
    byUrl.set(url, { row, matches: [...it.matches] });
    rows.push(row);
  }
  if (!rows.length) return 0;

  // Insert new articles and get every row's id back in one call (existing links keep their first version).
  let inserted = 0;
  const ids = new Map();
  for (let i = 0; i < rows.length; i += 200) {
    const out = await rest("rpc/save_articles", { method: "POST", body: JSON.stringify({ items: rows.slice(i, i + 200) }) });
    for (const r of out) { ids.set(r.url, r.id); if (r.is_new) inserted++; }
  }
  const links = [];
  for (const [url, { matches }] of byUrl) {
    const id = ids.get(url);
    if (!id) continue;
    const best = new Map();
    for (const m of matches) if (!best.has(m.ticker) || best.get(m.ticker).score < m.score) best.set(m.ticker, m);
    for (const m of best.values()) links.push({ article_id: id, ticker: m.ticker, reason: m.reason, score: m.score });
  }
  if (links.length) {
    await rest("news_article_tickers?on_conflict=article_id,ticker", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(links),
    });
  }
  return inserted;
}

/** Record how a source is doing: ok with a count, or an error (optionally backing off until a time). */
async function health(source, { ok, found = 0, error, backoffUntil } = {}) {
  const now = new Date().toISOString();
  const row = { source, updated_at: now, found_last: found };
  if (ok) { row.last_ok_at = now; row.backoff_until = null; }
  if (error) { row.last_error_at = now; row.last_error = String(error).slice(0, 500); if (backoffUntil) row.backoff_until = backoffUntil; }
  await rest("news_source_health?on_conflict=source", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify([row]),
  });
}

/** Save SEC filings; ones we already have are skipped. Returns how many were new. */
async function saveFilings(filings) {
  if (!filings.length) return 0;
  let added = 0;
  for (let i = 0; i < filings.length; i += 500) {
    const out = await rest("filings?on_conflict=accession&select=accession", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(filings.slice(i, i + 500)),
    });
    added += out.length;
  }
  return added;
}

module.exports = { saveArticles, saveFilings, health, cleanUrl };
