// GET /api/period?range=1M&tickers=AAPL,MSFT,...
// Every stock's closing price at the start of a timeframe, so lists can show real "% over this period".
// One Massive request returns all US stocks for a day; we walk back past weekends and holidays.
import { NextResponse } from "next/server";
import { massive, fromMassive, ymd, daysAgo } from "@/lib/massive";

const BACK: Record<string, number> = { "1W": 7, "1M": 30, "3M": 91, "1Y": 365, "5Y": 1826, "10Y": 1826 };

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const range = q.get("range") || "1M";
  const want = new Set((q.get("tickers") || "").split(",").filter(Boolean));
  const back = BACK[range];
  if (!back) return NextResponse.json({ error: "range must be one of " + Object.keys(BACK).join(", ") }, { status: 400 });

  try {
    for (let extra = 0; extra < 6; extra++) {
      const day = ymd(daysAgo(back + extra));
      const json = await massive<{ results?: { T: string; c: number }[] }>(
        `/v2/aggs/grouped/locale/us/market/stocks/${day}?adjusted=true`,
        3600,
      );
      if (json.results?.length) {
        // Keyed by the app's tickers (BRK.B → BRK-B, BNY → BK, ...).
        const closes: Record<string, number> = {};
        for (const r of json.results) { const t = fromMassive(r.T); if (!want.size || want.has(t)) closes[t] = r.c; }
        return NextResponse.json({ range, day, closes }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200", "Netlify-Vary": "query" } });
      }
    }
    return NextResponse.json({ error: "no trading day found" }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
