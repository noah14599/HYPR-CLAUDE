// Checks the relevance filter on tricky headlines. Run: npm test
const test = require("node:test");
const assert = require("node:assert");
const { compile, match, matchAll } = require("./relevance");
const companies = Object.fromEntries(require("./companies.json").map(c => [c.ticker, compile(c)]));

const is = (ticker, title, summary = "") => !!match(companies[ticker], title, summary);

test("plain company names and tickers match", () => {
  assert.ok(is("NVDA", "Nvidia beats estimates as data center revenue soars"));
  assert.ok(is("NVDA", "Chip stocks rally; NVDA leads gains"));
  assert.ok(is("AAPL", "Apple unveils new iPhone lineup at September event"));
  assert.ok(is("BRK-B", "Berkshire Hathaway trims its stake in Bank of America"));
  assert.ok(is("GOOGL", "Google faces new antitrust trial over ad tech"));
  assert.ok(is("META", "Facebook parent faces EU fine over data transfers"));
  assert.ok(is("JPM", "J.P. Morgan raises its S&P 500 year-end target"));
});

test("everyday-word names need business context", () => {
  assert.ok(!is("AAPL", "The best apple pie recipes for fall"));
  assert.ok(is("AAPL", "Apple shares slip after China sales data"));
  assert.ok(!is("TGT", "Why the Fed's inflation target matters"));
  assert.ok(is("TGT", "Target cuts its annual sales forecast"));
  assert.ok(!is("V", "How to get a travel visa for Japan"));
  assert.ok(is("V", "Visa reports record quarterly payments volume"));
  assert.ok(!is("CAT", "My cat learned to open doors"));
});

test("short and word-like tickers only count when written as a stock", () => {
  assert.ok(!is("T", "T minus 10: the countdown to launch"));
  assert.ok(is("T", "AT&T (NYSE: T) adds 400,000 wireless subscribers"));
  assert.ok(is("T", "Is $T a buy before earnings?"));
  assert.ok(!is("ON", "Stocks rise on strong jobs data"));
  assert.ok(is("ON", "Onsemi raises guidance as auto demand recovers"));
  assert.ok(!is("IT", "It was a rough week for markets"));
  assert.ok(is("IT", "Gartner (IT) cuts outlook on slower consulting demand"));
  assert.ok(!is("A", "A look at the week ahead on Wall Street"));
  assert.ok(!is("F", "F-35 deliveries resume after pause"));
  assert.ok(is("F", "Ford recalls 200,000 SUVs over brake issue"));
  assert.ok(!is("ALL", "All eyes on the Fed this week"));
  assert.ok(is("ALL", "Allstate shares jump on catastrophe-loss update"));
});

test("names that are part of something else don't match", () => {
  assert.ok(!is("DOW", "Dow Jones futures slip ahead of CPI report"));
  assert.ok(!is("DOW", "Dow industrials close at record high"));
  assert.ok(!is("DOW", "S&P 500, Dow and Nasdaq Rise After Steep AI Sell-Off"));
  assert.ok(!is("DOW", "Steve Feinberg Issues DOW Memo on AI Classification Pilot"));
  assert.ok(is("DOW", "Dow Inc cuts dividend as chemical demand stays weak"));
  assert.ok(!is("TGT", "Mercedes-Benz Group AG Stock 12-Month Price Target Cut to €52.52"));
  assert.ok(!is("TGT", "Analysts lift target price on Nvidia after earnings"));
  assert.ok(is("TGT", "Target Says It's Not Working With ICE Amid Uproar Over Parking Lot Use"));
  assert.ok(is("TGT", "Why Kroger and Target store workers are dressing to impress"));
});

test("acronym names only match in capitals", () => {
  assert.ok(is("CSX", "CSX quarterly profit tops estimates"));
  assert.ok(!is("AES", "The aes test results were inconclusive"));
});

test("only the headline and the first part of the story count", () => {
  const filler = "Markets were mixed on Tuesday as investors weighed new data on inflation and jobs. ".repeat(5);
  assert.ok(is("NVDA", "Markets mixed as investors weigh inflation", "Nvidia shares rose 2% early in the session."));
  assert.ok(!is("NVDA", "Markets mixed as investors weigh inflation", filler + "Elsewhere, Nvidia shares rose."));
});

test("banks acting as analysts don't get credit for the story", () => {
  const all = Object.values(companies);
  const about = (title, summary = "") => matchAll(all, title, summary).map(h => h.ticker).sort();
  assert.deepStrictEqual(about("JPMorgan Chase & Co. Cuts Parker-Hannifin (NYSE:PH) Price Target to $1,131.00"), ["PH"]);
  assert.deepStrictEqual(about("DuPont, Illinois Tool Works cut to Neutral at J.P. Morgan on downside short-cycle risk"), ["DD", "ITW"]);
  assert.ok(about("JPMorgan raises dividend after strong quarter").includes("JPM"));
  assert.ok(about("Goldman Sachs profit jumps 40% on trading boom").includes("GS"));
});

test("pages that aren't news are dropped", () => {
  const { isJunk } = require("./relevance");
  assert.ok(isJunk("MSFT Oct 2026 390.000 put (MSFT261009P00390000) stock price, news, quote and history", "https://uk.finance.yahoo.com/quote/MSFT261009P00390000"));
  assert.ok(isJunk("CAVA Group, Inc. (CAVA) stock price, news, quote and history - Yahoo Finance", "https://sg.finance.yahoo.com/quote/CAVA"));
  assert.ok(isJunk("Guarantor: JPMorgan Chase & Co.", "https://www.sec.gov/Archives/edgar/data/19617/x.htm"));
  assert.ok(!isJunk("Judge approves $177 million AT&T settlement", "https://www.reuters.com/legal/judge-approves-att-settlement-2026-10-09/"));
  assert.ok(!isJunk("Why AT&T (T) Shares Are Getting Obliterated Today", "https://finance.yahoo.com/news/why-t-shares-getting-obliterated-180000.html"));
});
