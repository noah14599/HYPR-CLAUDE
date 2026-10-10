// Fills company facts (SEC financials, Massive profile/dividends/short interest) for every company at once, instead of
// waiting for the always-on collector to get round to them. Finnhub parts are left to the collector (its free limit
// is shared with news). Same code the collector runs. Safe to run again.
//   npm run facts            all companies
//   npm run facts -- AAPL MSFT
(async () => {
  const { refreshCompany } = await import("../supabase/functions/_shared/facts/collect.mjs");
  const { rest } = await import("../supabase/functions/_shared/db.mjs");
  const only = process.argv.slice(2).map(s => s.toUpperCase());
  let companies = await rest("companies?select=ticker,name,cik&order=ticker");
  if (only.length) companies = companies.filter(c => only.includes(c.ticker));
  const existing = new Map((await rest("company_facts?select=ticker,sources")).map(r => [r.ticker, r.sources || {}]));
  let ok = 0;
  const problems = [];
  for (const [i, c] of companies.entries()) {
    const started = Date.now();
    const r = await refreshCompany(c, existing.get(c.ticker), { skipFinnhub: true });
    await rest("company_facts?on_conflict=ticker", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(r.row) });
    if (r.errors.length) problems.push(`${c.ticker}: ${r.errors.join("; ")}`); else ok++;
    if (r.blocked) { console.log(`${r.blocked} asked us to slow down; stopping. Run again later.`); break; }
    if ((i + 1) % 50 === 0) console.log(`${i + 1}/${companies.length}`);
    const wait = 250 - (Date.now() - started); // SEC allows 10 requests a second; we stay far below
    if (wait > 0) await new Promise(res => setTimeout(res, wait));
  }
  console.log(`done: ${ok} complete, ${problems.length} with a problem`);
  for (const p of problems) console.log("  " + p);
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
