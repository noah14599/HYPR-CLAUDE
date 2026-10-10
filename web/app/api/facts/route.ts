// GET /api/facts?ticker=AAPL
// Everything the stock page's Key stats, Financials and About sections show, from official/free sources:
//   SEC filings (financial statements), Massive (profile, dividends, short interest, today's trading, 52-week range),
//   Finnhub (beta, forward P/E, analyst ratings, earnings dates). Collected around the clock into our database.
// Numbers that depend on the share price (market cap, P/E, dividend yield…) are worked out in the browser from the
// same live price the page shows, so they always agree with it and move with it.
import { NextResponse } from "next/server";
import { massive, toMassive, ymd, daysAgo } from "@/lib/massive";

type Snap = { ticker?: { day?: { o?: number; h?: number; l?: number; v?: number }; prevDay?: { c?: number; v?: number } } };
type Aggs = { results?: { h: number; l: number; c: number; v: number; t: number }[] };

export async function GET(req: Request) {
  const ticker = (new URL(req.url).searchParams.get("ticker") || "").toUpperCase();
  if (!/^[A-Z.-]{1,6}$/.test(ticker)) return NextResponse.json({ error: "ticker required" }, { status: 400 });
  const base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) return NextResponse.json({ error: "SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY not set" }, { status: 500 });
  const m = toMassive(ticker);          // e.g. BK → BNY, BRK-B → BRK.B
  const db = m.replace(".", "-");       // our database writes class shares with a dash

  const [row, snap, year] = await Promise.all([
    fetch(`${base}/rest/v1/company_facts?ticker=eq.${encodeURIComponent(db)}&select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, next: { revalidate: 120 },
    }).then(r => (r.ok ? r.json() : [])).then(r => r[0] || null),
    massive<Snap>(`/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(m)}`, 30).catch(() => null),
    massive<Aggs>(`/v2/aggs/ticker/${encodeURIComponent(m)}/range/1/day/${ymd(daysAgo(366))}/${ymd(new Date())}?adjusted=true&sort=asc&limit=400`, 600).catch(() => null),
  ]);
  if (!row) return NextResponse.json({ error: "no facts yet for " + ticker }, { status: 404 });

  // Today's trading (15-minute delayed) and the past year's range, from Massive.
  const day = snap?.ticker?.day;
  const bars = year?.results || [];
  const last63 = bars.slice(-63);
  const trading = {
    open: day?.o || null, dayHigh: day?.h || null, dayLow: day?.l || null, volume: day?.v || null,
    prevVolume: snap?.ticker?.prevDay?.v || null,
    high52: bars.length ? Math.max(...bars.map(b => b.h)) : null,
    low52: bars.length ? Math.min(...bars.map(b => b.l)) : null,
    avgVolume3M: last63.length ? Math.round(last63.reduce((s, b) => s + b.v, 0) / last63.length) : null,
  };

  const f = row.financials || {};
  return NextResponse.json(
    {
      ticker,
      profile: row.profile,
      quarters: (f.quarters || []).slice(-12),
      years: (f.years || []).slice(-10),
      ttm: f.ttm || null,
      dividends: row.dividends || [],
      short: row.short_interest,
      metrics: row.metrics,
      analysts: row.analysts || [],
      earnings: row.earnings,
      trading,
      sources: row.sources,
      updatedAt: row.updated_at,
    },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60", "Netlify-Vary": "query" } },
  );
}
