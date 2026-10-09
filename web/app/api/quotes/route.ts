// GET /api/quotes?tickers=AAPL,MSFT,...
// The headline price for each ticker, matching how Google and brokers show it:
//   market open      → latest price (15-minute delayed on our plan), change vs. yesterday's close
//   after the close  → today's official 4pm close, change vs. yesterday's close, plus an "After hours" price
//   pre-market       → yesterday's official close and its change, plus a "Pre-market" price
//   overnight/weekend/holiday → the last official close and its change, plus that session's after-hours price
// All three /api routes send "Netlify-Vary: query": without it Netlify's cache ignores ?ticker=…&range=…
// and serves the first response it stored for every request.
import { NextResponse } from "next/server";
import { massive, toMassive, fromMassive, etParts, ymd } from "@/lib/massive";

type Snap = {
  ticker: string;
  day?: { c?: number };
  min?: { c?: number; t?: number };
  prevDay?: { c?: number };
};
type Status = { market: string; earlyHours: boolean; afterHours: boolean };
type Ext = { label: "After hours" | "Pre-market"; price: number; chg: number; chgPct: number };
export type Quote = {
  price: number;            // the headline price
  prevClose: number;        // what the headline change is measured against
  chg: number;
  chgPct: number;
  session: "open" | "closed";
  closeDate: string | null; // NY date of the official close shown, when the market isn't open
  ext: Ext | null;          // pre-market or after-hours trading, measured against the headline price
};

const CLOSE = 16 * 60; // 4:00pm New York, in minutes
const PREMARKET = 4 * 60;

// The two most recent completed trading sessions before `today`, as { dates, closes by app ticker }.
async function lastTwoSessions(today: string) {
  const dates: string[] = [];
  const closes: Record<string, number>[] = [];
  const d = new Date(today + "T12:00:00Z");
  for (let i = 0; i < 12 && dates.length < 2; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    const day = ymd(d);
    const json = await massive<{ results?: { T: string; c: number }[] }>(`/v2/aggs/grouped/locale/us/market/stocks/${day}?adjusted=true`, 3600);
    if (!json.results?.length) continue; // weekend or holiday
    const m: Record<string, number> = {};
    for (const r of json.results) m[fromMassive(r.T)] = r.c;
    dates.push(day);
    closes.push(m);
  }
  return { dates, closes };
}

const ext = (label: Ext["label"], price: number, base: number): Ext | null =>
  price && base && Math.abs(price - base) > 1e-9 ? { label, price, chg: price - base, chgPct: ((price - base) / base) * 100 } : null;

export async function GET(req: Request) {
  const tickers = (new URL(req.url).searchParams.get("tickers") || "").split(",").map(t => t.trim()).filter(Boolean).slice(0, 600);
  if (!tickers.length) return NextResponse.json({ error: "tickers required" }, { status: 400 });

  const byMassive = new Map(tickers.map(t => [toMassive(t), t]));
  try {
    const [status, snap] = await Promise.all([
      massive<Status>("/v1/marketstatus/now", 30),
      massive<{ tickers?: Snap[] }>(`/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${encodeURIComponent([...byMassive.keys()].join(","))}`, 10),
    ]);
    const now = etParts(Date.now());
    let sessions: Awaited<ReturnType<typeof lastTwoSessions>> | null = null;

    const quotes: Record<string, Quote> = {};
    for (const s of snap.tickers ?? []) {
      const t = byMassive.get(s.ticker);
      if (!t) continue;
      const day = s.day?.c || 0, prev = s.prevDay?.c || 0, last = s.min?.c || 0;
      const lastAt = s.min?.t ? etParts(s.min.t) : null;
      let q: Omit<Quote, "chg" | "chgPct"> | null = null;

      if (status.market === "open") {
        // Regular session: latest price against yesterday's close.
        q = { price: last || day, prevClose: prev, session: "open", closeDate: null, ext: null };
      } else if (day && lastAt && lastAt.date === now.date && now.minutes >= CLOSE) {
        // Today's session has closed (after hours, or later this evening).
        const after = lastAt.minutes >= CLOSE ? ext("After hours", last, day) : null;
        q = { price: day, prevClose: prev, session: "closed", closeDate: now.date, ext: after };
      } else {
        // Pre-market, after midnight, weekends and holidays: the last two official closes.
        sessions ??= await lastTwoSessions(now.date);
        const c1 = sessions.closes[0]?.[t], c0 = sessions.closes[1]?.[t];
        if (!c1 || !c0) continue;
        const lastDate = sessions.dates[0];
        let extra: Ext | null = null;
        if (lastAt && status.earlyHours && lastAt.date === now.date && lastAt.minutes >= PREMARKET) extra = ext("Pre-market", last, c1);
        else if (lastAt && (lastAt.date > lastDate || (lastAt.date === lastDate && lastAt.minutes >= CLOSE))) extra = ext("After hours", last, c1);
        q = { price: c1, prevClose: c0, session: "closed", closeDate: lastDate, ext: extra };
      }
      if (!q.price || !q.prevClose) continue;
      quotes[t] = { ...q, chg: q.price - q.prevClose, chgPct: ((q.price - q.prevClose) / q.prevClose) * 100 };
    }
    return NextResponse.json(
      { quotes, market: status.market, asOf: Date.now() },
      { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20", "Netlify-Vary": "query" } },
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
