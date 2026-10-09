// GET /api/quotes?tickers=AAPL,MSFT,...
// Current price (15-minute delayed on our plan) and today's change for each ticker, in one Massive request.
// All three /api routes send "Netlify-Vary: query": without it Netlify's cache ignores ?ticker=…&range=…
// and serves the first response it stored for every request.
import { NextResponse } from "next/server";
import { massive, toMassive } from "@/lib/massive";

type Snap = {
  ticker: string;
  todaysChange?: number;
  todaysChangePerc?: number;
  updated?: number;
  day?: { c?: number };
  min?: { c?: number };
  lastTrade?: { p?: number };
  prevDay?: { c?: number };
};

export async function GET(req: Request) {
  const tickers = (new URL(req.url).searchParams.get("tickers") || "").split(",").map(t => t.trim()).filter(Boolean).slice(0, 600);
  if (!tickers.length) return NextResponse.json({ error: "tickers required" }, { status: 400 });

  const byMassive = new Map(tickers.map(t => [toMassive(t), t]));
  try {
    const json = await massive<{ tickers?: Snap[] }>(
      `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${encodeURIComponent([...byMassive.keys()].join(","))}`,
      60,
    );
    const quotes: Record<string, { price: number; prevClose: number | null; chgPct: number | null; updated: number | null }> = {};
    for (const s of json.tickers ?? []) {
      const t = byMassive.get(s.ticker);
      if (!t) continue;
      // Latest available price: last trade, else the last minute bar, else today's close, else yesterday's.
      const price = s.lastTrade?.p || s.min?.c || s.day?.c || s.prevDay?.c;
      if (!price) continue;
      const prevClose = s.prevDay?.c || null;
      quotes[t] = {
        price,
        prevClose,
        chgPct: prevClose ? ((price - prevClose) / prevClose) * 100 : s.todaysChangePerc ?? null,
        updated: s.updated ? Math.round(s.updated / 1e6) : null,
      };
    }
    return NextResponse.json({ quotes, asOf: Date.now() }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120", "Netlify-Vary": "query" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
