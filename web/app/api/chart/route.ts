// GET /api/chart?ticker=AAPL&range=1M
// Real price history for one stock over one timeframe, as [timestamp, close] points.
import { NextResponse } from "next/server";
import { massive, toMassive, inSession, etParts, ymd, daysAgo } from "@/lib/massive";

// Bar size and lookback per timeframe. Intraday ranges keep regular trading hours only.
const RANGES: Record<string, { mult: number; span: string; back: number; cache: number; sessions?: number }> = {
  "1D":  { mult: 5,  span: "minute", back: 6,    cache: 60,   sessions: 1 },
  "1W":  { mult: 30, span: "minute", back: 10,   cache: 300,  sessions: 5 },
  "1M":  { mult: 1,  span: "hour",   back: 31,   cache: 900 },
  "3M":  { mult: 1,  span: "day",    back: 92,   cache: 3600 },
  "1Y":  { mult: 1,  span: "day",    back: 366,  cache: 3600 },
  "5Y":  { mult: 1,  span: "week",   back: 1827, cache: 3600 },
  "10Y": { mult: 1,  span: "week",   back: 1827, cache: 3600 }, // our plan's history stops at 5 years
};

type Agg = { t: number; c: number };

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const ticker = (q.get("ticker") || "").toUpperCase();
  const range = q.get("range") || "1M";
  const cfg = RANGES[range];
  if (!ticker || !cfg) return NextResponse.json({ error: "ticker and a valid range are required" }, { status: 400 });

  try {
    const json = await massive<{ results?: Agg[] }>(
      `/v2/aggs/ticker/${encodeURIComponent(toMassive(ticker))}/range/${cfg.mult}/${cfg.span}/${ymd(daysAgo(cfg.back))}/${ymd(new Date())}?adjusted=true&sort=asc&limit=50000`,
      cfg.cache,
    );
    let bars = json.results ?? [];
    if (cfg.span === "minute" || cfg.span === "hour") bars = bars.filter(b => inSession(b.t));
    if (cfg.sessions) {
      const dates = [...new Set(bars.map(b => etParts(b.t).date))].slice(-cfg.sessions);
      bars = bars.filter(b => dates.includes(etParts(b.t).date));
    }
    const points = bars.map(b => [b.t, b.c] as [number, number]);
    return NextResponse.json({ ticker, range, points }, { headers: { "Cache-Control": `public, s-maxage=${cfg.cache}, stale-while-revalidate=${cfg.cache * 2}`, "Netlify-Vary": "query" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
