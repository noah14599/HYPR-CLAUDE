// SEC EDGAR: every official filing for our companies. Public data, free for any use.
// Rules (docs/news-sources.md): identify with SEC_USER_AGENT ("HYPR <email>"), at most 10 requests/second.
// We stay at 5/second.

const UA = process.env.SEC_USER_AGENT;
if (!UA) throw new Error("SEC_USER_AGENT must be set in .env (app name and contact email)");

const MIN_GAP_MS = 200; // 5 requests per second
let last = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  const wait = last + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" } });
    if (res.status === 429 || res.status === 403) { await sleep(60000 * attempt); continue; } // SEC asks us to slow down: back off a minute+
    if (!res.ok) throw new Error(`SEC HTTP ${res.status} for ${url}`);
    return res;
  }
  throw new Error("SEC kept refusing; backing off");
}

// What each filing means, in plain English.
const FORMS = {
  "10-K": "Annual report", "10-Q": "Quarterly report", "8-K": "Major company event", "6-K": "Foreign company report",
  "4": "Insider bought or sold shares", "3": "New insider's holdings", "5": "Insider's annual holdings report",
  "144": "Insider plans to sell shares", "SC 13D": "Investor took a large active stake (5%+)", "SC 13G": "Investor took a large passive stake (5%+)",
  "SCHEDULE 13D": "Investor took a large active stake (5%+)", "SCHEDULE 13G": "Investor took a large passive stake (5%+)",
  "DEF 14A": "Shareholder meeting proxy", "S-1": "Registering new shares for sale", "S-3": "Registering shares for future sale",
  "SC TO-T": "Tender offer for shares", "SC 14D9": "Response to a tender offer", "11-K": "Employee stock plan report",
  "8-A12B": "Registering a security on an exchange", "25-NSE": "Security being delisted", "15-12B": "Ending SEC registration",
};
const ITEMS = {
  "1.01": "Signed a major agreement", "1.02": "Ended a major agreement", "1.03": "Bankruptcy or receivership", "1.05": "Cybersecurity incident",
  "2.01": "Completed an acquisition or sale", "2.02": "Quarterly results released", "2.03": "Took on new debt", "2.04": "Debt obligation triggered",
  "2.05": "Restructuring or layoffs", "2.06": "Asset write-down", "3.01": "Exchange listing notice", "3.02": "Sold unregistered shares",
  "3.03": "Change to shareholder rights", "4.01": "Changed auditors", "4.02": "Past results can't be relied on (restatement)",
  "5.01": "Change in control", "5.02": "Executive or board change", "5.03": "Changed bylaws or fiscal year", "5.07": "Shareholder vote results",
  "7.01": "Investor presentation or disclosure", "8.01": "Other important event", "9.01": "Financial statements and exhibits",
};
// Forms worth keeping. Left out on purpose: 424B prospectuses (banks file thousands of routine note offerings) and
// other paperwork.
const KEEP = new Set([...Object.keys(FORMS), "10-K/A", "10-Q/A", "8-K/A", "4/A", "SC 13D/A", "SC 13G/A", "SCHEDULE 13D/A", "SCHEDULE 13G/A"]);

function describe(form, items) {
  const base = FORMS[form.replace(/\/A$/, "")] || form;
  const amended = form.endsWith("/A") ? " (amended)" : "";
  if (!items) return base + amended;
  const parts = items.split(",").map(s => s.trim()).filter(i => i !== "9.01").map(i => ITEMS[i] || `item ${i}`);
  return (parts.length ? parts.join("; ") : base) + amended;
}

const pad = cik => String(cik).replace(/\D/g, "").padStart(10, "0");
const docUrl = (cik, acc, doc) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc.replace(/-/g, "")}/${doc}`;

/** A company's filings since `sinceDate` (YYYY-MM-DD), from its submissions file. */
async function companyFilings(company, sinceDate) {
  if (!company.cik) return [];
  const j = await (await get(`https://data.sec.gov/submissions/CIK${pad(company.cik)}.json`)).json();
  const r = j.filings?.recent;
  if (!r) return [];
  const out = [];
  for (let i = 0; i < r.form.length; i++) {
    if (r.filingDate[i] < sinceDate) break; // newest first
    const form = r.form[i];
    if (!KEEP.has(form)) continue;
    const acc = r.accessionNumber[i];
    out.push({
      accession: acc, ticker: company.ticker, form,
      filed_at: r.acceptanceDateTime[i] || r.filingDate[i] + "T00:00:00Z",
      items: r.items[i] || null, description: describe(form, r.items[i]),
      url: docUrl(company.cik, acc, r.primaryDocument[i] || ""),
    });
  }
  return out;
}

/** The latest filings across all companies (SEC's live feed), matched to ours by SEC ID. */
async function latest(companiesByCik, count = 100) {
  const xml = await (await get(`https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=&company=&dateb=&owner=include&start=0&count=${count}&output=atom`)).text();
  const out = [];
  for (const entry of xml.split("<entry>").slice(1)) {
    const title = (entry.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
    const m = title.match(/^(.+?) - .*\((\d{10})\) \((Filer|Issuer|Subject|Reporting)\)/);
    if (!m) continue;
    const [, form, cik, role] = m;
    if (role === "Reporting") continue; // insider's own copy of a Form 4; the issuer's copy is what we want
    const company = companiesByCik.get(String(Number(cik)));
    if (!company || !KEEP.has(form)) continue;
    const link = ((entry.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "").replace(/&amp;/g, "&");
    const acc = (entry.match(/accession-number=([\d-]+)/) || link.match(/(\d{10}-\d{2}-\d{6})/) || [])[1];
    const updated = (entry.match(/<updated>([^<]*)<\/updated>/) || [])[1];
    const items = ((entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1] || "").match(/Item (\d\.\d\d)/g);
    if (!acc) continue;
    const itemList = items ? [...new Set(items.map(s => s.slice(5)))].join(",") : null;
    out.push({ accession: acc, ticker: company.ticker, form, filed_at: updated, items: itemList, description: describe(form, itemList), url: link });
  }
  return out;
}

module.exports = { name: "sec", companyFilings, latest, describe };
