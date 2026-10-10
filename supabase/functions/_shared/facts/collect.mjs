// Refreshes one company's facts from free/official sources, each on its own so one failing never blanks the others:
//   SEC       financial statements (data.sec.gov company facts; ≤10 requests/s, we make 1–2 per company)
//   Massive   company profile, dividends, short interest (our paid plan; no per-minute limit)
//   Finnhub   beta / forward P/E, analyst buy-hold-sell counts, earnings dates and results (free: 60/min shared with news)
import { secFinancials } from "./sec-financials.mjs";

const env = k => (globalThis.Deno ? Deno.env.get(k) : process.env[k]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Companies whose SEC history sits under an older ID too (reorganised into a new holding company).
const PREVIOUS_CIKS = { XOM: ["34088"] };
// Our ticker → the one Massive / Finnhub use.
const MASSIVE = t => t.replace("-", ".");
const FINNHUB = t => t.replace("-", ".");

class Blocked extends Error { constructor(m) { super(m); this.name = "Blocked"; } }

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (res.status === 429) throw new Blocked(`HTTP 429 from ${new URL(url).hostname}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}${new URL(url).pathname}`);
  return res.json();
}

async function sec(c) {
  const ua = env("SEC_USER_AGENT");
  const ciks = [c.cik, ...(PREVIOUS_CIKS[c.ticker] || [])].filter(Boolean);
  if (!ciks.length) return null;
  let merged = null;
  for (const cik of ciks) {
    const facts = await getJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, "0")}.json`, { "User-Agent": ua });
    if (!merged) merged = facts;
    else for (const [ns, tags] of Object.entries(facts.facts || {})) {
      const into = (merged.facts[ns] ||= {});
      for (const [tag, v] of Object.entries(tags)) {
        if (!into[tag]) { into[tag] = v; continue; }
        for (const [unit, rows] of Object.entries(v.units)) into[tag].units[unit] = [...(into[tag].units[unit] || []), ...rows];
      }
    }
    await sleep(150);
  }
  return secFinancials(merged);
}

async function massive(c) {
  const key = env("MASSIVE_API_KEY");
  const t = encodeURIComponent(MASSIVE(c.ticker));
  const d = (await getJson(`https://api.massive.com/v3/reference/tickers/${t}?apiKey=${key}`)).results || {};
  const profile = {
    name: d.name, description: d.description || null, employees: d.total_employees ?? null, website: d.homepage_url || null,
    phone: d.phone_number || null, address: d.address ? [d.address.address1, d.address.city, d.address.state].filter(Boolean).join(", ") : null,
    city: d.address ? [d.address.city, d.address.state].filter(Boolean).join(", ") : null,
    industry: d.sic_description || null, listed: d.list_date || null, exchange: d.primary_exchange || null,
    // All share classes together, in this class's terms (what market cap is based on).
    shares: d.weighted_shares_outstanding ?? d.share_class_shares_outstanding ?? null,
    classShares: d.share_class_shares_outstanding ?? null,
  };
  const div = await getJson(`https://api.massive.com/v3/reference/dividends?ticker=${t}&limit=12&order=desc&sort=ex_dividend_date&apiKey=${key}`);
  const dividends = (div.results || []).map(x => ({ amount: x.cash_amount, ex: x.ex_dividend_date, pay: x.pay_date, declared: x.declaration_date || null,
    frequency: x.frequency ?? null, type: x.dividend_type || null }));
  const si = await getJson(`https://api.massive.com/stocks/v1/short-interest?ticker=${t}&limit=1&sort=settlement_date.desc&apiKey=${key}`);
  const s = (si.results || [])[0];
  const short = s ? { shares: s.short_interest, date: s.settlement_date, daysToCover: s.days_to_cover, avgDailyVolume: s.avg_daily_volume } : null;
  return { profile, dividends, short };
}

async function finnhub(c) {
  const key = env("FINNHUB_API_KEY");
  const t = encodeURIComponent(FINNHUB(c.ticker));
  const base = "https://finnhub.io/api/v1";
  const m = (await getJson(`${base}/stock/metric?symbol=${t}&metric=all&token=${key}`)).metric || {};
  await sleep(1100);
  const metrics = { beta: m.beta ?? null, forwardPE: m.forwardPE ?? null, forwardPEG: m.forwardPEG ?? null, epsTTM: m.epsInclExtraItemsTTM ?? m.epsTTM ?? null };
  const rec = await getJson(`${base}/stock/recommendation?symbol=${t}&token=${key}`);
  const analysts = (Array.isArray(rec) ? rec : []).slice(0, 6).map(r => ({ month: r.period, strongBuy: r.strongBuy, buy: r.buy, hold: r.hold, sell: r.sell, strongSell: r.strongSell }));
  await sleep(1100);
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10);
  const cal = (await getJson(`${base}/calendar/earnings?symbol=${t}&from=${today}&to=${until}&token=${key}`)).earningsCalendar || [];
  const next = cal.filter(x => x.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  await sleep(1100);
  const hist = await getJson(`${base}/stock/earnings?symbol=${t}&token=${key}`);
  const earnings = {
    next: next ? { date: next.date, hour: next.hour || null, quarter: next.quarter, year: next.year, epsEstimate: next.epsEstimate, revenueEstimate: next.revenueEstimate } : null,
    // Finnhub's "actual" EPS is the adjusted figure analysts compare against, not the SEC-reported one.
    recent: (Array.isArray(hist) ? hist : []).slice(0, 8).map(x => ({ period: x.period, quarter: x.quarter, year: x.year, actual: x.actual, estimate: x.estimate, surprisePct: x.surprisePercent })),
  };
  return { metrics, analysts, earnings };
}

/** Refresh one company. Returns the row to save (only the parts that succeeded), per-source errors, and which source refused us (if any). */
export async function refreshCompany(c, previousSources = {}, { skipFinnhub = false } = {}) {
  const now = new Date().toISOString();
  const row = { ticker: c.ticker, updated_at: now };
  const sources = { ...previousSources };
  const errors = [];
  let blocked = null;
  const attempt = async (name, fn, apply) => {
    try {
      const out = await fn();
      apply(out);
      sources[name] = { ok: now };
    } catch (e) {
      sources[name] = { ...(sources[name] || {}), error: e.message.slice(0, 300), errorAt: now };
      errors.push(`${name}: ${e.message}`);
      if (e.name === "Blocked") blocked = name;
    }
  };
  await attempt("sec", () => sec(c), f => {
    if (!f) return;
    row.financials = f;
    row.sec_filed = f.quarters.at(-1)?.end || null;
  });
  await attempt("massive", () => massive(c), x => { row.profile = x.profile; row.dividends = x.dividends; row.short_interest = x.short; });
  if (!skipFinnhub) await attempt("finnhub", () => finnhub(c), x => { row.metrics = x.metrics; row.analysts = x.analysts; row.earnings = x.earnings; });
  row.sources = sources;
  return { row, errors, blocked };
}
