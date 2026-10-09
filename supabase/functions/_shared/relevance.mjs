// Shared by the scheduled collectors (Supabase) and the local scripts/tests (pipeline/). Decides whether a news story is about a company, by the owner's rule: the company's name or ticker
// must appear in the headline or the first part of the story. Returns why it matched, or null.

const WINDOW = 300; // characters of the summary that count as "the first little bit"

// Words that suggest a business story, required near names that are also ordinary words (Apple, Target, Visa).
const BUSINESS = /\b(stocks?|shares?|inc\.?|corp\.?|company|companies|ceo|cfo|chief executive|earnings|revenue|profit|quarter(ly)?|q[1-4]|fiscal|analysts?|investors?|nyse|nasdaq|s&p|wall street|market cap|deal|acquisitions?|acquire[sd]?|merger|price target|upgrades?|downgrades?|rating|sales|guidance|outlook|buyback|dividends?|sec|lawsuit|layoffs?|ipo|valuation|trillion|billion|million|forecast|results|launch(es|ed)?|unveils?|announces?|recalls?|antitrust|regulators?|court|judge|trial|probe|investigation|ftc|doj|fine[sd]?|strike|union|tariffs?|contract|partnership|stake|executives?|board|shareholders?|stores?|retail(?:er|ers)?|shoppers?|workers|employees|customers|boycotts?|brands?|chain)\b/i;

// Single-word names that are also everyday words (or common surnames): need business context nearby to count.
const COMMON_NAMES = new Set(["apple", "amazon", "target", "visa", "meta", "alphabet", "ball", "oracle", "progressive", "southern",
  "delta", "united", "southwest", "caterpillar", "monster", "mosaic", "block", "square", "snap", "fox", "pool", "waters", "gen",
  "dominion", "edison", "prudential", "principal", "jacobs", "realty", "corning", "cummins", "match", "ford", "lilly", "citi",
  "deere", "ally", "keycorp", "discover", "public", "global", "american", "general", "international", "first", "national",
  "goldman", "berkshire", "chase", "sun", "edge", "arch", "regency", "ventas", "hubbell", "garmin", "eaton", "nucor", "linde",
  "intuit", "salesforce", "uber", "airbnb", "nike", "disney", "pfizer", "merck", "boeing", "chevron", "exxon", "walmart", "dow"]);

// A headline that opens with the company doing something ("Target says…", "Apple unveils…") is about the company.
const ACTION = "(?:'s\\b|\\s+(?:says?|said|to|will|is|was|has|had|reports?|plans?|cuts?|raises?|sues?|sued|agrees?|launch(?:es)?|denies|confirms?|names?|hires?|fires?|recalls?|warns?|expands?|closes?|opens?|buys?|sells?|faces?|wins?|loses?|settles?|drops?|adds?|ends?|halts?|pauses?|unveils?|announces?|beats?|misses?|tops?|slashes|lifts?|boosts?|pulls?|stops?|reaches?|signs?|teams?|partners?|bets?|pushes?|rolls?|shuts?|scraps?|delays?|spends?|invests?|reverses?|responds?|apologizes?|pledges?|vows?|seeks?|asks?|tells?|joins?|leaves?)\\b)";

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Ticker written the way finance writers mark a stock: $T, (T), (NYSE: T), NASDAQ:T, "T stock".
function tickerPatterns(ticker) {
  const forms = [ticker, ticker.replace("-", "."), ticker.replace("-", "/")].map(esc);
  const any = "(?:" + forms.join("|") + ")";
  return {
    marked: new RegExp(
      "(?:\\$" + any + "\\b)|(?:\\(\\s*" + any + "\\s*\\))|(?:\\b(?:NYSE|NASDAQ|Nasdaq|NYSE American|Cboe)\\s*:\\s*" + any + "\\b)|(?:\\b" + any + "\\s+(?:stock|shares)\\b)",
    ),
    bare: new RegExp("(?<![A-Za-z0-9$])" + any + "(?![A-Za-z0-9])"), // case-sensitive: AAPL, not aapl
  };
}

// Names that are part of something else: Dow Inc. is not "Dow Jones"; Target Corp. is not a "price target".
const NOT_FOLLOWED_BY = { Dow: "\\s+(?:Jones|Industrials?|futures)", Target: "\\s+(?:[Pp]rice|[Dd]ate)\\b", Apple: "\\s+(?:Valley|pie|cider|orchard|juice|picking)\\b" };
const NOT_PRECEDED_BY = { Target: "(?:[Pp]rice|PRICE)[\\s-]+", Apple: "(?:Big|big|Crab|crab|candy|caramel|green|red)\\s+" };

function namePattern(alias) {
  // Whole words; allow "Apple's", "Meta-owned". Acronyms (CSX, AES, KLA) must be in capitals; other names any case.
  const acronym = /^[A-Z0-9&]{2,6}$/.test(alias);
  const body = esc(alias).replace(/\\\./g, "\\.?").replace(/\s+/g, "\\s+");
  const not = NOT_FOLLOWED_BY[alias] ? "(?!" + NOT_FOLLOWED_BY[alias] + ")" : "";
  const notBefore = NOT_PRECEDED_BY[alias] ? "(?<!" + NOT_PRECEDED_BY[alias] + ")" : "";
  return new RegExp(notBefore + "(?<![A-Za-z0-9])" + body + "(?![A-Za-z0-9])" + not, acronym ? "" : "i");
}

/** Prepare a company for fast repeated matching. */
function compile(company) {
  return {
    ...company,
    tick: tickerPatterns(company.ticker),
    names: company.aliases.map(a => ({ alias: a, re: namePattern(a), strict: COMMON_NAMES.has(a.toLowerCase()),
      opens: new RegExp("^\\W*" + esc(a).replace(/\s+/g, "\\s+") + ACTION, "i") })),
  };
}

/** Is this story about the company? Returns { score, reason } or null. */
function match(compiled, title, summary) {
  const head = title || "";
  const lead = (summary || "").slice(0, WINDOW);
  for (const [part, text, weight] of [["title", head, 2], ["summary", lead, 1]]) {
    if (!text) continue;
    if (compiled.tick.marked.test(text)) return { score: weight + 1, reason: `ticker ${compiled.ticker} marked in ${part}` };
    if (!compiled.ticker_strict && compiled.tick.bare.test(text)) return { score: weight, reason: `ticker ${compiled.ticker} in ${part}` };
    for (const n of compiled.names) {
      if (!n.re.test(text)) continue;
      // "apple pie" is not Apple Inc.: everyday-word names need business words nearby, or to open the headline as its subject.
      if (n.strict && !BUSINESS.test(head + " " + lead) && !(part === "title" && n.opens.test(head))) continue;
      return { score: weight, reason: `name "${n.alias}" in ${part}` };
    }
  }
  return null;
}

// Banks and brokers whose analysts rate other companies' stocks all day.
const BROKERS = new Set(["JPM", "GS", "MS", "C", "BAC", "WFC", "RJF", "SCHW", "BK", "STT", "NTRS", "IBKR", "HOOD"]);
const ANALYST_NOTE = /\b(price target|target price|PT\b|upgrades?|downgrades?|upgraded|downgraded|initiat\w*|reiterat\w*|maintains?|rating|overweight|underweight|outperform|underperform|neutral|equal[- ]weight|market perform|sector perform|coverage|(?:raises?|cuts?|lifts?|lowers?|boosts?|trims?) .{0,40}target)\b/i;

/** All companies a story is about. Round-ups that name many companies score lower for each. */
function matchAll(compiledList, title, summary) {
  let hits = [];
  for (const c of compiledList) {
    const m = match(c, title, summary);
    if (m) hits.push({ ticker: c.ticker, ...m });
  }
  // "JPMorgan cuts Parker-Hannifin price target" is about Parker-Hannifin, not JPMorgan.
  if (hits.some(h => !BROKERS.has(h.ticker)) && ANALYST_NOTE.test(title + " " + (summary || "").slice(0, WINDOW))) {
    hits = hits.filter(h => !BROKERS.has(h.ticker));
  }
  if (hits.length >= 5) for (const h of hits) h.score = Math.max(1, h.score - 1);
  return hits;
}

export { compile, match, matchAll, BUSINESS, COMMON_NAMES };

// Pages that are never news, whatever company they name: quote pages, option chains, bond paperwork.
const JUNK_TITLE = /(stock price, news, quote|stock quote|quote (?:&|and) history|price (?:&|and) chart|stock chart|historical prices|options? chain|\b[A-Z]{1,5}\d{6}[CP]\d{8}\b|\b(?:put|call) \(|^guarantor:|^pricing supplement|^free writing prospectus|^\s*(?:form )?(?:424b|fwp)\b|market cap history|dividend history|earnings date|stock forecast & price target|stock price today)/i;
const JUNK_URL = /\/(?:quote|quotes|options|chart|market-activity\/stocks\/[a-z.-]+$|symbol\/[a-z.-]+$)(?:[/?#]|$)/i;

/** True for pages that aren't news stories (stock quote pages, option chains, prospectus paperwork). */
// Social media posts are left out for now (owner's decision); news only.
const SOCIAL = /(?:^|\.)(?:instagram|facebook|tiktok|twitter|x|threads|reddit|pinterest|linkedin|snapchat)\.com$/i;

export function isJunk(title, url) {
  let host = "";
  try { host = new URL(url).hostname; } catch {}
  if (SOCIAL.test(host)) return true;
  return JUNK_TITLE.test(title || "") || JUNK_URL.test((() => { try { return new URL(url).pathname; } catch { return ""; } })());
}
