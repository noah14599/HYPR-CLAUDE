// Collects SEC filings for our companies.
//   npm run filings -- --backfill 90        → each company's filings from the last 90 days
//   npm run filings -- --backfill 90 --only AAPL,NVDA
//   npm run filings                         → SEC's latest-filings feed (run every 10 minutes)
const sec = require("./sources/sec");
const { saveFilings, health } = require("./news-store");
const companies = require("./companies.json");

const args = process.argv.slice(2);
const arg = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

(async () => {
  const only = arg("--only") ? new Set(arg("--only").split(",")) : null;
  const list = companies.filter(c => !only || only.has(c.ticker));
  try {
    if (arg("--backfill")) {
      const since = new Date(Date.now() - Number(arg("--backfill")) * 864e5).toISOString().slice(0, 10);
      let found = 0, added = 0;
      for (const [i, c] of list.entries()) {
        const f = await sec.companyFilings(c, since);
        found += f.length;
        added += await saveFilings(f);
        if ((i + 1) % 50 === 0 || i === list.length - 1) console.log(`${i + 1}/${list.length} companies · ${found} filings found · ${added} new`);
      }
      await health("sec", { ok: true, found: added });
    } else {
      const byCik = new Map(companies.filter(c => c.cik).map(c => [String(Number(c.cik)), c]));
      const f = await sec.latest(byCik, 100);
      const added = await saveFilings(f);
      console.log(`latest feed: ${f.length} filings for our companies · ${added} new`);
      await health("sec", { ok: true, found: added });
    }
  } catch (e) {
    console.error("FAILED:", e.message);
    await health("sec", { error: e.message }).catch(() => {});
    process.exit(1);
  }
})();
