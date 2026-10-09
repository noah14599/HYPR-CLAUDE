/**
 * DEMO NUMBERS. Ported unchanged from the design prototype so every screen matches it.
 * Everything in this file is made up from each stock's `seed` and gets replaced by real
 * prices (World 4) and the real HYPR score (World 5). Nothing outside lib/ should need to change then.
 */
import type { Stock } from "./stocks";

export const RANGES = ["1D", "1W", "1M", "3M", "1Y", "5Y", "10Y"] as const;
export type Range = (typeof RANGES)[number];

export const RANGE_TAG: Record<Range, string> = {
  "1D": "Today", "1W": "This week", "1M": "This month", "3M": "Last 3 months",
  "1Y": "Last year", "5Y": "Last 5 years", "10Y": "Last 10 years",
};

const rangeIdx = (k: Range) => RANGES.indexOf(k);

export function rhash(seed: number, k: Range): number {
  let h = (Math.abs(Math.round(seed)) + 7) * 2654435761 + rangeIdx(k) * 40503 + 101;
  h = h ^ (h >>> 13); h = (h * 1274126177) & 0x7fffffff;
  return (h ^ (h >>> 11)) & 0x7fffffff;
}

const D_SCORE: Record<Range, number> = { "1D": -18, "1W": -12, "1M": 0, "3M": -5, "1Y": -8, "5Y": -14, "10Y": -22 };
const PERIOD_RET: Record<Range, number> = { "1D": 0.007, "1W": 0.021, "1M": 0.1232, "3M": 0.185, "1Y": 0.340, "5Y": 1.900, "10Y": 5.200 };
const PRICE_SPAN: Record<Range, number> = { "1D": 2.6, "1W": 5, "1M": 9, "3M": 16, "1Y": 34, "5Y": 120, "10Y": 240 };

export type RangeStats = { score: number; prev: number; jump: number; chg: number };

/** A stock's HYPR score, previous score and price move over one window. */
export function statsFor(stock: Stock, range: Range): RangeStats {
  const sd = stock.seed;
  const dz = D_SCORE[range] * (stock.score / 96);
  const h = rhash(sd + 3, range);
  const jit = ((h % 2001) / 1000 - 1) * (range === "1D" ? 4 : 13);
  const score = Math.max(9, Math.min(99, Math.round(stock.score + dz + jit)));
  const jh = rhash(sd + 61, range);
  const mag = 1 + (jh % 17);
  const jump0 = (score >= 72 ? (jh % 100) < 78 : (jh % 100) < 34) ? mag : -mag;
  const prev = Math.max(5, Math.min(99, score - jump0));
  const delta = score - prev;
  // Price move for the window; direction tracks the score move so the two agree.
  const ph = rhash(Math.round(stock.price * 13) + 5, range);
  const down = delta < 0 ? (ph % 100) < 74 : (ph % 100) < 22;
  const chg = +(((ph % 1000) / 1000 * 0.85 + 0.15) * PRICE_SPAN[range] * (down ? -1 : 1)).toFixed(2);
  return { score, prev, jump: delta, chg };
}

/** Tiny sparkline path in a 120×38 box. */
export function sparkPath(seed: number, chg: number): string {
  let s = Math.abs(Math.round(seed)) * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const n = 44, out: number[] = [];
  let v = 0;
  for (let i = 0; i < n; i++) { v += (rnd() - 0.47) * 1.6 + (chg / n) * 0.9; out.push(v); }
  const lo = Math.min(...out), hi = Math.max(...out), sp = (hi - lo) || 1;
  return out.map((y, i) => (i ? "L" : "M") + ((i / (n - 1)) * 120).toFixed(1) + " " + (38 - 3 - ((y - lo) / sp) * 32).toFixed(1)).join(" ");
}

const compressPct = (v: number) => v >= 0 ? v : +(-100 * (1 - 1 / (1 + Math.abs(v) / 110))).toFixed(2);

export type StripItem = { key: string; label: string; val: string; chg: number; line: string; href: string };

const INDICES = [
  { k: "SPX", label: "S&P 500", val: 6842.15, chg: 0.62, seed: 11 },
  { k: "NDX", label: "Nasdaq 100", val: 25318.40, chg: 0.94, seed: 23 },
  { k: "DJI", label: "Dow 30", val: 47206.80, chg: 0.28, seed: 31 },
];

export function indexStrip(range: Range): StripItem[] {
  return INDICES.map(x => {
    let chg = x.chg;
    if (range !== "1D") {
      const wob = 0.86 + (rhash(x.seed, range) % 1000) / 1000 * 0.3;
      chg = compressPct(+(PERIOD_RET[range] * 100 * (x.chg / 0.62) * 0.45 * wob).toFixed(2));
    }
    return {
      key: x.k, label: x.label, href: "/markets",
      val: x.val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      chg, line: sparkPath(x.seed + rangeIdx(range) * 17, chg),
    };
  });
}

export const SECTORS = [
  { k: "XLK", name: "Technology", d: 0.94, score: 88 },
  { k: "XLY", name: "Consumer disc.", d: 0.61, score: 79 },
  { k: "XLC", name: "Communication", d: 0.72, score: 84 },
  { k: "XLF", name: "Financials", d: 0.34, score: 71 },
  { k: "XLI", name: "Industrials", d: 0.22, score: 66 },
  { k: "XLV", name: "Health care", d: -0.18, score: 58 },
  { k: "XLP", name: "Consumer staples", d: -0.26, score: 47 },
  { k: "XLE", name: "Energy", d: -0.88, score: 42 },
  { k: "XLU", name: "Utilities", d: -0.34, score: 54 },
  { k: "XLRE", name: "Real estate", d: -0.52, score: 39 },
  { k: "XLB", name: "Materials", d: 0.12, score: 51 },
];

/** The four best-performing sector ETFs for the window. */
export function sectorStrip(range: Range): StripItem[] {
  return SECTORS.map(s => {
    const d = range === "1D" ? s.d
      : compressPct(+(PERIOD_RET[range] * 100 * (s.d / 0.62) * 0.45 * (0.88 + (rhash(Math.round(Math.abs(s.d) * 733) + 9, range) % 1000) / 1000 * 0.28)).toFixed(2));
    const price = 40 + (rhash(Math.round(Math.abs(s.d) * 761) + 29, "1D") % 21000) / 100;
    return {
      key: s.k, label: s.k, href: "/sectors", val: "$" + price.toFixed(2), chg: d,
      line: sparkPath(Math.round(Math.abs(s.d) * 997) + 11 + rangeIdx(range) * 23, d),
    };
  }).sort((a, b) => b.chg - a.chg).slice(0, 4);
}
