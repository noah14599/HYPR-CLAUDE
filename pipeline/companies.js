// Builds the company directory: official name, SEC ID and every name news stories use for each company,
// plus flags for tickers and names that are ordinary words. Saves to companies.json and the companies table.
//
//   npm run companies
const fs = require("fs");
const path = require("path");
const { connect } = require("./db");
const SP500 = require("./sp500.json");

const KEY = process.env.MASSIVE_API_KEY;
if (!KEY) throw new Error("MASSIVE_API_KEY must be set");

// Exact names to use instead of the generated ones, where a short name means something else
// (plain "Dow" is usually the Dow Jones index or the Department of War).
const ONLY = { DOW: ["Dow Inc", "Dow Chemical"] };

// Names people actually use that official names don't contain.
const EXTRA = {
  GOOGL: ["Google", "Alphabet"], GOOG: ["Google", "Alphabet"], META: ["Facebook"], AMZN: ["Amazon", "AWS"],
  "BRK-B": ["Berkshire Hathaway", "Berkshire"], JPM: ["JPMorgan", "JP Morgan", "J.P. Morgan"], BAC: ["Bank of America", "BofA"],
  WFC: ["Wells Fargo"], GS: ["Goldman Sachs", "Goldman"], MS: ["Morgan Stanley"], C: ["Citigroup", "Citi"],
  JNJ: ["Johnson & Johnson", "J&J"], PG: ["Procter & Gamble", "P&G"], KO: ["Coca-Cola"], PEP: ["PepsiCo", "Pepsi"],
  XOM: ["Exxon", "ExxonMobil", "Exxon Mobil"], CVX: ["Chevron"], WMT: ["Walmart"], HD: ["Home Depot"], LOW: ["Lowe's"],
  MA: ["Mastercard"], V: ["Visa"], T: ["AT&T"], VZ: ["Verizon"], TMUS: ["T-Mobile"], CMCSA: ["Comcast"],
  LLY: ["Eli Lilly", "Lilly"], UNH: ["UnitedHealth"], GM: ["General Motors"], F: ["Ford"], GE: ["GE Aerospace"],
  NVDA: ["Nvidia"], AMD: ["AMD"], INTC: ["Intel"], DIS: ["Disney"], NKE: ["Nike"], SBUX: ["Starbucks"],
  MCD: ["McDonald's"], COST: ["Costco"], TGT: ["Target"], CRM: ["Salesforce"], ORCL: ["Oracle"], IBM: ["IBM"],
  BA: ["Boeing"], CAT: ["Caterpillar"], DE: ["John Deere", "Deere"], UPS: ["UPS"], FDX: ["FedEx"], DAL: ["Delta Air Lines"],
  UAL: ["United Airlines"], LUV: ["Southwest Airlines"], AAL: ["American Airlines"], MRK: ["Merck"], PFE: ["Pfizer"],
  ABBV: ["AbbVie"], BMY: ["Bristol Myers", "Bristol-Myers Squibb"], TSLA: ["Tesla"], NFLX: ["Netflix"], AVGO: ["Broadcom"],
  CMG: ["Chipotle"], ABNB: ["Airbnb"], UBER: ["Uber"], PYPL: ["PayPal"], XYZ: ["Block", "Square", "Cash App"],
  HON: ["Honeywell"], MMM: ["3M"], AXP: ["American Express", "Amex"], SCHW: ["Charles Schwab", "Schwab"],
  BLK: ["BlackRock"], BX: ["Blackstone"], KKR: ["KKR"], CVS: ["CVS"], WBD: ["Warner Bros. Discovery", "Warner Bros"],
  PSKY: ["Paramount"],
};

const { COMMON_NAMES } = require("./relevance");

// Tickers that are ordinary words or very short: only count when written as a stock ($T, (T), NYSE: T, "T stock").
const WORD_TICKERS = new Set(["ALL", "ARE", "CAT", "FAST", "HAS", "IT", "KEY", "KEYS", "LOW", "NOW", "ON", "POOL", "PEG", "GEN",
  "DASH", "SNAP", "SHOP", "COIN", "APP", "TAP", "BALL", "DOC", "HUM", "WELL", "BEN", "LEN", "MAS", "ROL", "TECH", "TEL", "TER",
  "WAT", "FOX", "DAY", "EXE", "FIX", "CASH", "BIG", "EVER", "SO", "AN", "FE", "WY", "STE", "BRO", "CARR", "CPAY", "ROST", "TT",
  "IEX", "UBER", "META", "COST", "LUV", "PLTR", "AMP", "ATO", "AXON", "BK", "CB", "CHD", "CI", "COO", "DG", "ED", "EL", "EQT",
  "ES", "FDS", "GL", "GD", "GS", "HD", "IP", "IR", "J", "KR", "L", "LH", "MA", "MO", "MS", "NI", "O", "PH", "PM", "PG", "Q", "RF",
  "RL", "SW", "TRV", "V", "WM", "A", "C", "D", "F", "T", "BR", "BG", "BX", "CF", "CL", "DD", "DE", "EG", "EW", "GE", "GM", "KO",
  "MU", "ED", "DOW"]);

const SUFFIX = /[,\s]+(inc\.?|incorporated|corporation|corp\.?|co\.?|company|ltd\.?|limited|plc|n\.v\.|s\.a\.|l\.p\.|holdings?|group|class [a-c]|common stock|ordinary shares|new|\(the\)|& co\.?|the)$/i;

function clean(name) {
  // Long all-caps words become Title Case (BERKSHIRE HATHAWAY → Berkshire Hathaway, NVIDIA → Nvidia);
  // short ones stay as acronyms (AES, CSX, KLA, 3M).
  let n = name.trim().replace(/\b[A-Z][A-Z0-9]{4,}\b/g, w => w[0] + w.slice(1).toLowerCase());
  n = n.replace(/^the\s+/i, "");
  for (let i = 0; i < 4; i++) n = n.replace(SUFFIX, "").trim();
  return n;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function details(ticker) {
  const t = ticker.replace("-", ".");
  const res = await fetch(`https://api.massive.com/v3/reference/tickers/${encodeURIComponent(t)}?apiKey=${KEY}`);
  if (!res.ok) return null;
  return (await res.json()).results || null;
}

(async () => {
  const out = [];
  for (const s of SP500) {
    const d = await details(s.t);
    const official = d?.name ? clean(d.name).replace(/\s+Class\s+[A-C]$/i, "") : clean(s.name);
    // Leading name in Massive's description, e.g. "Berkshire Hathaway is a holding company..."
    const lead = (d?.description || "").match(/^([A-Z][A-Za-z0-9&.'\- ]{2,40}?)\s+(?:is|was|operates|provides|designs|makes)\b/);
    // Curated names first, so their casing wins when duplicates are dropped.
    const names = ONLY[s.t] ? [...ONLY[s.t]] : [...(EXTRA[s.t] || []), official, clean(s.name)];
    // Only if every word is capitalised (skips things like "Atlanta-based Delta Air Lines").
    if (!ONLY[s.t] && lead && /^[A-Z0-9][\w&.']*(?:\s[A-Z0-9][\w&.']*)*$/.test(lead[1]) && !/^(The|It|This|Its)\b/.test(lead[1])) names.push(clean(lead[1]));
    const seen = new Set();
    const aliases = names.filter(n => {
      const k = (n || "").toLowerCase();
      if (!n || n.length < 2 || seen.has(k) || /^(advanced|american|first|general|global|international|national|united)$/i.test(n)) return false;
      seen.add(k);
      return true;
    });
    out.push({
      ticker: s.t,
      name: d?.name || s.name,
      aliases,
      cik: d?.cik || null,
      ticker_strict: s.t.replace("-", "").length <= 2 || WORD_TICKERS.has(s.t),
      name_strict: aliases.some(a => COMMON_NAMES.has(a.toLowerCase())),
    });
    await sleep(50);
  }
  fs.writeFileSync(path.join(__dirname, "companies.json"), JSON.stringify(out, null, 1));

  const db = connect();
  await db.connect();
  for (const c of out) {
    await db.query(
      `insert into public.companies (ticker, name, aliases, cik, ticker_strict, name_strict, updated_at) values ($1,$2,$3,$4,$5,$6,now())
       on conflict (ticker) do update set name=excluded.name, aliases=excluded.aliases, cik=excluded.cik,
         ticker_strict=excluded.ticker_strict, name_strict=excluded.name_strict, updated_at=now()`,
      [c.ticker, c.name, c.aliases, c.cik, c.ticker_strict, c.name_strict],
    );
  }
  await db.end();
  console.log(`${out.length} companies saved. With SEC ID: ${out.filter(c => c.cik).length}. Strict tickers: ${out.filter(c => c.ticker_strict).length}. Strict names: ${out.filter(c => c.name_strict).length}.`);
})().catch(e => { console.error("FAILED:", e.message.replace(KEY, "***")); process.exit(1); });
