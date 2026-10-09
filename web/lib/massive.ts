// Server-only helpers for Massive (market data). The API key never reaches the browser:
// these run inside our /api routes on the server.
import "server-only";

const BASE = "https://api.massive.com";

function key(): string {
  const k = process.env.MASSIVE_API_KEY;
  if (!k) throw new Error("MASSIVE_API_KEY is not set");
  return k;
}

// The app uses the prototype's tickers. Massive writes class shares with a dot, and four
// companies have changed tickers since the prototype was made.
const RENAMED: Record<string, string> = { BK: "BNY", SATS: "ECHO", FI: "FISV", MMC: "MRSH" };
export const toMassive = (t: string) => (RENAMED[t] ?? t).replace("-", ".");
const BACK_TO_APP = Object.fromEntries(Object.entries(RENAMED).map(([a, b]) => [b, a]));
export const fromMassive = (t: string) => { const d = t.replace(".", "-"); return BACK_TO_APP[d] ?? d; };

/** GET a Massive endpoint as JSON, cached on our server for `revalidate` seconds. */
export async function massive<T>(path: string, revalidate: number): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}apiKey=${key()}`, { next: { revalidate } });
  if (!res.ok) throw new Error(`Massive HTTP ${res.status} for ${path.split("?")[0]}`);
  return res.json() as Promise<T>;
}

const ET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});
/** A timestamp's New York date (YYYY-MM-DD) and minutes since midnight. */
export function etParts(ms: number) {
  const p = Object.fromEntries(ET.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
/** Regular trading hours, 9:30am to 4:00pm New York time. */
export const inSession = (ms: number) => { const m = etParts(ms).minutes; return m >= 570 && m < 960; };

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const daysAgo = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d; };
