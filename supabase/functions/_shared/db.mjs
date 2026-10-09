// Database helpers for the scheduled collectors (Supabase web API with the service key Supabase provides).
const env = k => (globalThis.Deno ? Deno.env.get(k) : process.env[k]);
const BASE = (env("SUPABASE_URL") || "").replace(/\/$/, "");
const KEY = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

export async function rest(path, init = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${init.method || "GET"} ${path.split("?")[0]}: HTTP ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const upsert = (table, rows, onConflict) => rest(`${table}?on_conflict=${onConflict}`, {
  method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows),
});

export async function loadCompanies() {
  return rest("companies?select=ticker,name,aliases,cik,ticker_strict,name_strict&order=ticker");
}

// Same article, different tracking codes → one link.
export function cleanUrl(u) {
  try {
    const x = new URL(u);
    x.hash = "";
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|cmpid|ref$|src$|ncid|guccounter|\.tsrc)/i.test(k)) x.searchParams.delete(k);
    let s = x.toString();
    if (s.endsWith("/") && x.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch { return u; }
}

/** Save stories with their company matches. Returns how many stories were new. */
export async function saveArticles(items) {
  const byUrl = new Map();
  for (const it of items) {
    if (!it.url || !it.title || !it.matches?.length) continue;
    const url = cleanUrl(it.url);
    if (byUrl.has(url)) { byUrl.get(url).matches.push(...it.matches); continue; }
    byUrl.set(url, {
      row: { url, title: it.title.trim().slice(0, 500), summary: it.summary ? it.summary.trim().slice(0, 2000) : null,
        source: it.source || "", found_via: it.found_via, published_at: it.published_at || null },
      matches: [...it.matches],
    });
  }
  const rows = [...byUrl.values()].map(v => v.row);
  if (!rows.length) return 0;
  let added = 0;
  const ids = new Map();
  for (let i = 0; i < rows.length; i += 200) {
    const out = await rest("rpc/save_articles", { method: "POST", body: JSON.stringify({ items: rows.slice(i, i + 200) }) });
    for (const r of out) { ids.set(r.url, r.id); if (r.is_new) added++; }
  }
  const links = [];
  for (const [url, { matches }] of byUrl) {
    const id = ids.get(url);
    if (!id) continue;
    const best = new Map();
    for (const m of matches) if (!best.has(m.ticker) || best.get(m.ticker).score < m.score) best.set(m.ticker, m);
    for (const m of best.values()) links.push({ article_id: id, ticker: m.ticker, reason: m.reason, score: m.score });
  }
  for (let i = 0; i < links.length; i += 500) await upsert("news_article_tickers", links.slice(i, i + 500), "article_id,ticker");
  return added;
}

/** Save SEC filings; ones we already have are skipped. Returns how many were new. */
export async function saveFilings(filings) {
  if (!filings.length) return 0;
  const out = await rest("filings?on_conflict=accession&select=accession", {
    method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(filings),
  });
  return out.length;
}

/** Source health: ok with a count, or an error, optionally backing off until a time. */
export async function health(source, { ok, found = 0, error, backoffUntil } = {}) {
  const now = new Date().toISOString();
  const row = { source, updated_at: now, found_last: found };
  if (ok) { row.last_ok_at = now; row.backoff_until = null; }
  if (error) { row.last_error_at = now; row.last_error = String(error).slice(0, 500); if (backoffUntil) row.backoff_until = backoffUntil; }
  await upsert("news_source_health", [row], "source");
}

/** Is this source backing off right now? */
export async function backingOff(source) {
  const r = await rest(`news_source_health?select=backoff_until&source=eq.${source}`);
  return r[0]?.backoff_until && new Date(r[0].backoff_until) > new Date() ? r[0].backoff_until : null;
}

/** Where a round-robin collector left off. */
export async function getState(source) {
  const r = await rest(`collector_state?select=next_index,round&source=eq.${source}`);
  return r[0] || { next_index: 0, round: 0 };
}
export const setState = (source, next_index, round) =>
  upsert("collector_state", [{ source, next_index, round, updated_at: new Date().toISOString() }], "source");

/** "Only if changed" markers for a feed. */
export async function getFeedCache(url) {
  const r = await rest(`feed_cache?select=etag,last_modified&url=eq.${encodeURIComponent(url)}`);
  return r[0] || {};
}
export const setFeedCache = (url, etag, last_modified) =>
  upsert("feed_cache", [{ url, etag: etag || null, last_modified: last_modified || null, checked_at: new Date().toISOString() }], "url");
