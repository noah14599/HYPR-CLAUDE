// Collects end-of-day prices for every S&P 500 stock from Massive and saves them to prices_daily.
//
//   npm run prices                 → the most recent trading day
//   npm run prices -- --days 30    → backfill the last 30 calendar days
//
// Massive's "grouped daily" endpoint returns every US stock for one day in a single request,
// so each day costs one request. The free plan allows 5 requests a minute, so backfills pace themselves.
const { connect } = require("./db");
const SP500 = require("./sp500.json");

const KEY = process.env.MASSIVE_API_KEY;
if (!KEY) throw new Error("MASSIVE_API_KEY must be set in .env");

const args = process.argv.slice(2);
const DAYS = Number(args[args.indexOf("--days") + 1]) || 7;
const PACE_MS = 13000; // 5 requests/minute on the free plan

// Massive writes class shares with a dot (BRK.B); the app uses a dash (BRK-B).
const toMassive = t => t.replace("-", ".");
const WANT = new Map(SP500.map(s => [toMassive(s.t), s.t]));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ymd = d => d.toISOString().slice(0, 10);

async function fetchDay(day) {
  const url = `https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/${day}?adjusted=true&apiKey=${KEY}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) { await sleep(PACE_MS * attempt); continue; } // rate limited: wait and retry
    if (res.status === 403) return { results: [], beyondPlan: true }; // older than the plan's history allows
    if (!res.ok) throw new Error(`Massive returned HTTP ${res.status} for ${day}`);
    return res.json();
  }
  throw new Error(`Massive kept rate-limiting ${day}`);
}

async function save(db, day, rows) {
  if (!rows.length) return;
  const cols = ["ticker", "day", "open", "high", "low", "close", "volume", "vwap"];
  const values = [];
  const params = rows.map((r, i) => {
    values.push(r.ticker, day, r.o, r.h, r.l, r.c, r.v, r.vw ?? null);
    return "(" + cols.map((_, j) => "$" + (i * cols.length + j + 1)).join(",") + ")";
  });
  await db.query(
    `insert into public.prices_daily (${cols.join(",")}) values ${params.join(",")}
     on conflict (ticker, day) do update set open=excluded.open, high=excluded.high, low=excluded.low,
       close=excluded.close, volume=excluded.volume, vwap=excluded.vwap, updated_at=now()`,
    values,
  );
}

(async () => {
  const db = connect();
  await db.connect();
  let saved = 0, tradingDays = 0;
  const today = new Date();
  for (let back = DAYS; back >= 1; back--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - back);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue; // weekends
    const day = ymd(d);
    const json = await fetchDay(day);
    const rows = (json.results || []).filter(x => WANT.has(x.T)).map(x => ({ ...x, ticker: WANT.get(x.T) }));
    if (rows.length) { await save(db, day, rows); saved += rows.length; tradingDays++; }
    console.log(`${day}: ${rows.length ? rows.length + " stocks saved" : json.beyondPlan ? "older than the plan allows, skipped" : "market closed"}`);
    if (back > 1) await sleep(PACE_MS);
  }
  const missing = await db.query(
    "select count(*)::int n from unnest($1::text[]) t where not exists (select 1 from public.prices_daily p where p.ticker = t)",
    [SP500.map(s => s.t)],
  );
  console.log(`Done: ${saved} prices over ${tradingDays} trading days. Tickers with no data yet: ${missing.rows[0].n}`);
  await db.end();
})().catch(e => { console.error("FAILED:", e.message.replace(KEY, "***")); process.exit(1); });
