// Collects end-of-day prices for every S&P 500 stock from Massive and saves them to prices_daily.
//
//   npm run prices                 → the most recent trading day
//   npm run prices -- --days 30    → backfill the last 30 calendar days
//
// Massive's "grouped daily" endpoint returns every US stock for one day in a single request,
// so each day costs one request. The Stocks Starter plan has no request cap and 5 years of history.
const SP500 = require("./sp500.json");

const KEY = process.env.MASSIVE_API_KEY;
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!KEY || !SUPABASE_URL || !SECRET) throw new Error("MASSIVE_API_KEY, SUPABASE_URL and SUPABASE_SECRET_KEY must be set");

const args = process.argv.slice(2);
const DAYS = Number(args[args.indexOf("--days") + 1]) || 7;
const PACE_MS = 250; // small courtesy pause; the paid plan has no per-minute cap
const BACKOFF_MS = 15000; // if Massive ever says "too many requests", wait and retry

// Massive writes class shares with a dot (BRK.B); the app uses a dash (BRK-B).
const toMassive = t => t.replace("-", ".");
const WANT = new Map(SP500.map(s => [toMassive(s.t), s.t]));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ymd = d => d.toISOString().slice(0, 10);

async function fetchDay(day) {
  const url = `https://api.massive.com/v2/aggs/grouped/locale/us/market/stocks/${day}?adjusted=true&apiKey=${KEY}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) { await sleep(BACKOFF_MS * attempt); continue; } // rate limited: wait and retry
    if (res.status === 403) return { results: [], beyondPlan: true }; // older than the plan's history allows
    if (!res.ok) throw new Error(`Massive returned HTTP ${res.status} for ${day}`);
    return res.json();
  }
  throw new Error(`Massive kept rate-limiting ${day}`);
}

// Saves through Supabase's web API with the secret key, so it works from anywhere (including GitHub's servers).
async function save(day, rows) {
  if (!rows.length) return;
  const body = rows.map(r => ({
    ticker: r.ticker, day, open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v, vwap: r.vw ?? null,
    updated_at: new Date().toISOString(),
  }));
  const res = await fetch(`${SUPABASE_URL}/rest/v1/prices_daily?on_conflict=ticker,day`, {
    method: "POST",
    headers: {
      apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase refused the save for ${day}: HTTP ${res.status} ${await res.text()}`);
}

// Which S&P 500 tickers have no price on the given day (e.g. delisted or renamed).
async function missingOn(day) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/prices_daily?select=ticker&day=eq.${day}`, {
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
  });
  const have = new Set((await res.json()).map(r => r.ticker));
  return SP500.filter(s => !have.has(s.t)).map(s => s.t);
}

(async () => {
  let saved = 0, tradingDays = 0, lastDay = null;
  const today = new Date();
  for (let back = DAYS; back >= 1; back--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - back);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue; // weekends
    const day = ymd(d);
    const json = await fetchDay(day);
    const rows = (json.results || []).filter(x => WANT.has(x.T)).map(x => ({ ...x, ticker: WANT.get(x.T) }));
    if (rows.length) { await save(day, rows); saved += rows.length; tradingDays++; lastDay = day; }
    console.log(`${day}: ${rows.length ? rows.length + " stocks saved" : json.beyondPlan ? "older than the plan allows, skipped" : "market closed"}`);
    if (back > 1) await sleep(PACE_MS);
  }
  const missing = lastDay ? await missingOn(lastDay) : [];
  console.log(`Done: ${saved} prices over ${tradingDays} trading days.` + (lastDay ? ` Missing on ${lastDay}: ${missing.length ? missing.join(" ") : "none"}` : ""));
})().catch(e => { console.error("FAILED:", e.message.replace(KEY, "***")); process.exit(1); });
