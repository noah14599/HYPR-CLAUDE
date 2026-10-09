import raw from "./data/stocks.json";

/** One S&P 500 company. Prices and scores here are still the design's demo values. */
export type Stock = {
  t: string;          // ticker
  name: string;
  ex: string;         // exchange
  sector: string;
  gics?: string;      // GICS sector letter code
  cap?: number;       // market cap, $bn
  price: number;
  prev?: number;
  score: number;      // HYPR score 0–100
  color: string;      // brand colour
  mark: string;       // fallback letter when there is no logo
  logo?: string;
  logoLight?: string;
  fit?: "contain" | "cover";
  seed: number;       // drives the demo chart generator until real data lands
  g?: number;
  tier?: string;
};

export const STOCKS: Stock[] = (raw as Stock[]).map(s => ({
  ...s,
  logo: s.logo ? "/" + s.logo : undefined,
  logoLight: s.logoLight ? "/" + s.logoLight : undefined,
}));

const BY_TICKER = new Map(STOCKS.map(s => [s.t, s]));

export function getStock(ticker: string): Stock | undefined {
  return BY_TICKER.get(ticker.toUpperCase());
}
