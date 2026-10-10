// One scheduled run of one source. Per-company sources pick up where the last run left off and handle a small
// batch at their own pace; feeds and SEC check everything once. Refusals stop the source and back off.
import { compile, matchAll, isJunk } from "./relevance.mjs";
import { rest, loadCompanies, saveArticles, saveFilings, health, backingOff, getState, setState, getFeedCache, setFeedCache } from "./db.mjs";
import { google, yahoo, finnhub } from "./sources/per-company.mjs";
import { FEEDS, readFeed } from "./sources/feeds.mjs";
import { latest } from "./sources/sec.mjs";
import { refreshCompany } from "./facts/collect.mjs";

const PER_COMPANY = { google, yahoo, finnhub };
const BACKOFF_MS = { google: 2 * 3600e3, yahoo: 2 * 3600e3, finnhub: 15 * 60e3, feeds: 3600e3, sec: 10 * 60e3, facts: 15 * 60e3 };
const FACTS_PER_RUN = 3; // ×4 Finnhub calls = 12/min, next to the news collector's 40 (Finnhub's free limit is 60)
const sleep = ms => new Promise(r => setTimeout(r, ms));

const relevant = (all, stories) => {
  const out = [];
  for (const s of stories) {
    if (!s.title || !s.url || isJunk(s.title, s.url, s.source)) continue;
    const matches = matchAll(all, s.title, s.summary);
    if (matches.length) out.push({ ...s, matches });
  }
  return out;
};

async function refused(source, e) {
  const until = new Date(Date.now() + BACKOFF_MS[source]).toISOString();
  await health(source, { error: e.message, backoffUntil: until });
  return { source, stopped: e.message, backoffUntil: until };
}

export async function run(source) {
  const waitUntil = await backingOff(source);
  if (waitUntil) return { source, skipped: `backing off until ${waitUntil}` };
  const companies = await loadCompanies();
  const all = companies.map(compile);

  if (PER_COMPANY[source]) {
    const src = PER_COMPANY[source];
    const st = await getState(source);
    let i = st.next_index % all.length, round = st.round, found = 0, kept = 0, added = 0, done = 0;
    const errors = [];
    for (let n = 0; n < src.perRun; n++) {
      const started = Date.now();
      const c = all[i];
      try {
        const stories = await src.search(c);
        const items = relevant(all, stories);
        found += stories.length; kept += items.length;
        added += await saveArticles(items);
      } catch (e) {
        if (e.name === "Blocked") { await setState(source, i, round); return { ...(await refused(source, e)), done, added }; }
        errors.push(`${c.ticker}: ${e.message}`);
      }
      done++;
      i = (i + 1) % all.length;
      if (i === 0) round++;
      const wait = src.paceMs - (Date.now() - started);
      if (n < src.perRun - 1 && wait > 0) await sleep(wait);
    }
    await setState(source, i, round);
    await health(source, errors.length === done ? { error: errors[0] } : { ok: true, found: added });
    return { source, companies: done, nextIndex: i, round, found, relevant: kept, added, errors: errors.slice(0, 3) };
  }

  if (source === "feeds") {
    let found = 0, kept = 0, added = 0, unchanged = 0;
    const errors = [];
    for (const f of FEEDS) {
      try {
        const cache = await getFeedCache(f.url);
        const r = await readFeed(f, { etag: cache.etag, lastModified: cache.last_modified });
        if (!r) { unchanged++; continue; }
        const items = relevant(all, r.stories);
        found += r.stories.length; kept += items.length;
        added += await saveArticles(items);
        await setFeedCache(f.url, r.etag, r.lastModified);
      } catch (e) {
        errors.push(`${f.name}: ${e.message}`); // one feed refusing doesn't stop the others; it's recorded below
      }
      await sleep(1000);
    }
    await health("feeds", errors.length ? { ok: true, found: added, error: errors.join(" | ") } : { ok: true, found: added });
    return { source, feeds: FEEDS.length, unchanged, found, relevant: kept, added, errors };
  }

  if (source === "facts") {
    const due = await rest("rpc/facts_due", { method: "POST", body: JSON.stringify({ n: FACTS_PER_RUN }) });
    const byTicker = new Map(companies.map(c => [c.ticker, c]));
    const done = [], errors = [];
    let skipFinnhub = false;
    for (const { ticker } of due) {
      const c = byTicker.get(ticker);
      const prev = (await rest(`company_facts?select=sources&ticker=eq.${encodeURIComponent(ticker)}`))[0]?.sources || {};
      const r = await refreshCompany(c, prev, { skipFinnhub });
      await rest("company_facts?on_conflict=ticker", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(r.row) });
      done.push(ticker);
      errors.push(...r.errors.map(e => `${ticker} ${e}`));
      if (r.blocked === "finnhub") skipFinnhub = true; // Finnhub said slow down: the rest of this run skips it
      if (r.blocked === "sec" || r.blocked === "massive") { await health("facts", { error: r.errors.at(-1), backoffUntil: new Date(Date.now() + BACKOFF_MS.facts).toISOString() }); break; }
    }
    await health("facts", errors.length && errors.length >= done.length * 3 ? { error: errors[0] } : { ok: true, found: done.length, ...(errors.length ? { error: errors.join(" | ") } : {}) });
    return { source, companies: done, errors };
  }

  if (source === "sec") {
    try {
      const byCik = new Map(companies.filter(c => c.cik).map(c => [String(Number(c.cik)), c]));
      const f = await latest(byCik, 100);
      const added = await saveFilings(f);
      await health("sec", { ok: true, found: added });
      return { source, filings: f.length, added };
    } catch (e) {
      if (e.name === "Blocked") return refused("sec", e);
      throw e;
    }
  }

  throw new Error(`unknown source ${source}`);
}
