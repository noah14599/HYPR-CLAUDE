// Collects news stories from one source for our companies, at that source's pace (docs/news-sources.md).
//   npm run news -- --source google            → all companies, ~1 every 14 s
//   npm run news -- --source yahoo --only AAPL,NVDA
//   npm run news -- --source gdelt
// Every story is checked against all 503 companies (a story can be about several); only stories that name
// a company in the headline or first part are kept. If a source refuses us, we stop and back off.
const { compile, matchAll } = require("./relevance");
const { saveArticles, health } = require("./news-store");
const companies = require("./companies.json");

const SOURCES = { google: "./sources/google-news", yahoo: "./sources/yahoo", gdelt: "./sources/gdelt" };
const BACKOFF_HOURS = 2;

const args = process.argv.slice(2);
const arg = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const src = require(SOURCES[arg("--source")] || "");
  const only = arg("--only") ? new Set(arg("--only").split(",")) : null;
  const all = companies.map(compile);
  const list = all.filter(c => !only || only.has(c.ticker));
  let found = 0, kept = 0, added = 0;

  for (const [i, c] of list.entries()) {
    const started = Date.now();
    try {
      const stories = await src.search(c);
      const items = [];
      for (const s of stories) {
        const matches = matchAll(all, s.title, s.summary);
        if (matches.length) items.push({ ...s, matches });
      }
      found += stories.length;
      kept += items.length;
      added += await saveArticles(items);
    } catch (e) {
      if (e.name === "Blocked" || e.constructor?.name === "Blocked") {
        const until = new Date(Date.now() + BACKOFF_HOURS * 3600e3).toISOString();
        console.error(`${src.name} refused us (${e.message}). Stopping; backing off until ${until}.`);
        await health(src.name, { error: e.message, backoffUntil: until });
        process.exit(2);
      }
      console.error(`${c.ticker}: ${e.message}`); // one company failing doesn't stop the run
    }
    if ((i + 1) % 25 === 0 || i === list.length - 1) console.log(`${i + 1}/${list.length} companies · ${found} stories found · ${kept} relevant · ${added} new`);
    const wait = src.PACE_MS - (Date.now() - started);
    if (i < list.length - 1 && wait > 0) await sleep(wait);
  }
  await health(src.name, { ok: true, found: added });
})().catch(async e => { console.error("FAILED:", e.message); process.exit(1); });
