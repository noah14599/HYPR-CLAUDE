// Checks the SEC financials converter on the tricky cases. Run: npm test
const test = require("node:test");
const assert = require("node:assert");

const load = () => import("../supabase/functions/_shared/facts/sec-financials.mjs").then(m => m.secFinancials);
const fact = (start, end, val, form = "10-Q", filed = end) => ({ start, end, val, form, filed, accn: form + end, fy: 2025, fp: "Q" });
const facts = gaap => ({ cik: 1, entityName: "Test", facts: { "us-gaap": Object.fromEntries(Object.entries(gaap).map(([tag, rows]) => [tag, { units: { [tag.startsWith("EarningsPerShare") ? "USD/shares" : tag.startsWith("WeightedAverage") ? "shares" : "USD"]: rows } }])) } });

test("fourth quarter = full year minus the first three; cash flow from year-to-date figures", async () => {
  const secFinancials = await load();
  const r = secFinancials(facts({
    Revenues: [fact("2025-01-01", "2025-03-31", 100), fact("2025-04-01", "2025-06-30", 110), fact("2025-07-01", "2025-09-30", 120),
      fact("2025-01-01", "2025-12-31", 460, "10-K", "2026-02-01")],
    NetCashProvidedByUsedInOperatingActivities: [fact("2025-01-01", "2025-03-31", 10), fact("2025-01-01", "2025-06-30", 25),
      fact("2025-01-01", "2025-09-30", 45), fact("2025-01-01", "2025-12-31", 70, "10-K", "2026-02-01")],
  }));
  assert.deepStrictEqual(r.quarters.map(q => q.revenue), [100, 110, 120, 130]);
  assert.deepStrictEqual(r.quarters.map(q => q.operatingCashFlow), [10, 15, 20, 25]);
  assert.strictEqual(r.ttm.revenue, 460);
});

test("a 'fourth quarter' that is really the whole year (a filing mistake) is replaced", async () => {
  const secFinancials = await load();
  const r = secFinancials(facts({
    Revenues: [fact("2025-01-01", "2025-03-31", 100), fact("2025-04-01", "2025-06-30", 110), fact("2025-07-01", "2025-09-30", 120),
      fact("2025-10-01", "2025-12-31", 460, "10-K", "2026-02-01"), fact("2025-01-01", "2025-12-31", 460, "10-K", "2026-02-01")],
  }));
  assert.strictEqual(r.quarters.at(-1).revenue, 130);
});

test("banks: revenue is net interest income plus fee income", async () => {
  const secFinancials = await load();
  const r = secFinancials(facts({
    InterestIncomeExpenseNet: [fact("2025-01-01", "2025-03-31", 300)],
    NoninterestIncome: [fact("2025-01-01", "2025-03-31", 200)],
    NetIncomeLoss: [fact("2025-01-01", "2025-03-31", 90)],
  }));
  assert.strictEqual(r.quarters[0].revenue, 500);
  assert.strictEqual(r.quarters[0].grossProfit, null); // banks have no gross profit: shown as "—"
});

test("the newest filing of a period wins (restated numbers)", async () => {
  const secFinancials = await load();
  const r = secFinancials(facts({
    Revenues: [fact("2025-01-01", "2025-03-31", 100, "10-Q", "2025-05-01"), fact("2025-01-01", "2025-03-31", 95, "10-Q", "2026-05-01")],
  }));
  assert.strictEqual(r.quarters[0].revenue, 95);
});

test("EPS missing from plain filings is worked out from profit ÷ diluted shares and flagged", async () => {
  const secFinancials = await load();
  const r = secFinancials(facts({
    NetIncomeLoss: [fact("2025-01-01", "2025-03-31", 50e6)],
    WeightedAverageNumberOfDilutedSharesOutstanding: [fact("2025-01-01", "2025-03-31", 25e6)],
  }));
  assert.strictEqual(r.quarters[0].eps, 2);
  assert.strictEqual(r.quarters[0].epsDerived, true);
});
