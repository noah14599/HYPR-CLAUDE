// Turns SEC "company facts" (every number a company has filed in its 10-Qs and 10-Ks, free from data.sec.gov)
// into clean quarterly and yearly statements. Rules, so nothing shown is made up:
//  - Only numbers from 10-K / 10-Q filings (and their amendments); the most recently filed version of a period wins.
//  - Each line uses one SEC label per company (the one the company currently reports); older years may fall back.
//  - Companies don't file a separate Q4, and cash-flow numbers are filed year-to-date. Those quarters are worked out
//    by subtraction (full year minus nine months, six months minus three months…), which is exact for money amounts.
//    For earnings per share it's the standard approximation, so those quarters are flagged `epsDerived`.
//  - A line the company doesn't report (banks have no "gross profit") stays null and the site shows "—".

const DAY = 864e5;
const len = (s, e) => Math.round((Date.parse(e) - Date.parse(s)) / DAY) + 1;
const isQuarter = d => d >= 75 && d <= 125;   // includes 16-week first quarters (e.g. Kroger)
const isYear = d => d >= 340 && d <= 380;     // includes 52/53-week years
const FORMS = /^(10-K|10-Q|10-KT|10-QT)(\/A)?$/;

// Money amounts over a period (duration facts). First label = preferred when several are current.
const FLOWS = {
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet", "SalesRevenueGoodsNet", "SalesRevenueServicesNet", "RevenuesNetOfInterestExpense", "RegulatedAndUnregulatedOperatingRevenue",
    "ElectricUtilityRevenue", "RealEstateRevenueNet", "OperatingLeasesIncomeStatementLeaseRevenue"],
  costOfRevenue: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold", "CostOfServices", "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization"],
  grossProfit: ["GrossProfit"],
  rnd: ["ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic", "ProfitLoss"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PaymentsForCapitalImprovements",
    "PaymentsToAcquireOtherPropertyPlantAndEquipment"],
  buybacks: ["PaymentsForRepurchaseOfCommonStock"],
  dividendsPaid: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
  depreciation: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet", "Depreciation"],
};
// Per-share and share-count amounts over a period (not additive; derived quarters are approximate).
const PER_SHARE = {
  eps: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"],
  dilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfShareOutstandingBasicAndDiluted"],
};
// Balances on a date (instant facts).
const BALANCES = {
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "Cash"],
  totalAssets: ["Assets"],
  totalLiabilities: ["Liabilities"],
  longTermDebt: ["LongTermDebt", "LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"],
  equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
};

/** Latest-filed value for each period of one SEC label: Map("start|end" or "end" → fact). */
function periods(gaap, tag, unit) {
  const rows = gaap[tag]?.units?.[unit];
  if (!rows) return null;
  const out = new Map();
  for (const r of rows) {
    if (!FORMS.test(r.form) || typeof r.val !== "number") continue;
    const k = r.start ? `${r.start}|${r.end}` : r.end;
    const have = out.get(k);
    if (!have || r.filed > have.filed || (r.filed === have.filed && r.accn > have.accn)) out.set(k, r);
  }
  return out.size ? out : null;
}

const lastEnd = m => { let e = ""; for (const r of m.values()) if (r.end > e) e = r.end; return e; };

/** Pick the label the company uses most over the last three years; periods it didn't file under that label are
 *  filled from its other labels. Each value remembers its label so subtraction never mixes two labels. */
function pickLabel(gaap, tags, unit) {
  const found = tags.map((t, i) => ({ tag: t, i, m: periods(gaap, t, unit) })).filter(x => x.m);
  if (!found.length) return null;
  const newest = Math.max(...found.map(x => Date.parse(lastEnd(x.m))));
  const recent = x => [...x.m.values()].filter(r => Date.parse(r.end) >= newest - 3 * 365 * DAY).length;
  found.sort((a, b) => recent(b) - recent(a) || a.i - b.i);
  const merged = new Map();
  for (const x of found) for (const [k, r] of x.m) if (!merged.has(k)) merged.set(k, { ...r, tag: x.tag });
  return { tag: found[0].tag, m: merged };
}

/** Quarterly values (end date → {val, start, derived}) and yearly values (end date → {val, tag}) for one line.
 *  additive=false (per-share, share counts): quarters can't be made by subtraction, except EPS (flagged). */
function quartersAndYears(m, { additive = true, allowEpsDerive = false } = {}) {
  const q = new Map(), y = new Map(), byStart = new Map();
  for (const r of m.values()) {
    if (!r.start) continue;
    const d = len(r.start, r.end);
    if (isQuarter(d)) q.set(r.end, { val: r.val, start: r.start, tag: r.tag, derived: false });
    if (isYear(d)) y.set(r.end, { val: r.val, start: r.start, tag: r.tag });
    (byStart.get(r.start) || byStart.set(r.start, []).get(r.start)).push(r);
  }
  // Filing mistakes: a "fourth quarter" carrying the whole year's number. Drop it; it's worked out below instead.
  for (const [end, v] of q) {
    const yr = y.get(end);
    if (yr && !v.derived && v.val !== 0 && Math.abs(v.val - yr.val) <= Math.abs(yr.val) * 0.001) q.delete(end);
  }
  if (!additive && !allowEpsDerive) return { q, y };
  // Year-to-date chains (3, 6, 9, 12 months from the same fiscal-year start): each step is one quarter.
  for (const chain of byStart.values()) {
    chain.sort((a, b) => a.end.localeCompare(b.end));
    for (let i = 1; i < chain.length; i++) {
      const prev = chain[i - 1], cur = chain[i];
      if (prev.tag !== cur.tag || q.has(cur.end)) continue;
      const qStart = new Date(Date.parse(prev.end) + DAY).toISOString().slice(0, 10);
      if (!isQuarter(len(qStart, cur.end))) continue;
      q.set(cur.end, { val: cur.val - prev.val, start: qStart, tag: cur.tag, derived: true });
    }
  }
  // Fourth quarters filed only as "full year": full year minus the three quarters inside it (same label only).
  for (const [end, yr] of y) {
    if (q.has(end)) continue;
    const inside = [...q.entries()].filter(([e, v]) => v.start >= yr.start && e < end);
    if (inside.length !== 3 || inside.some(([, v]) => v.tag !== yr.tag)) continue;
    const q3end = inside.map(([e]) => e).sort().pop();
    const qStart = new Date(Date.parse(q3end) + DAY).toISOString().slice(0, 10);
    if (!isQuarter(len(qStart, end))) continue;
    q.set(end, { val: yr.val - inside.reduce((s, [, v]) => s + v.val, 0), start: qStart, tag: yr.tag, derived: true });
  }
  return { q, y };
}

const round = (v, dp = 0) => (v == null || !isFinite(v) ? null : Math.round(v * 10 ** dp) / 10 ** dp);

/**
 * @param facts  JSON from https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
 * @param maxQuarters how many recent quarters to keep (40 = 10 years)
 */
export function secFinancials(facts, { maxQuarters = 40, maxYears = 15 } = {}) {
  const gaap = facts?.facts?.["us-gaap"];
  if (!gaap) return null;
  const g = { ...gaap, _BankRevenue: bankRevenue(gaap) };
  const labels = {};
  const lines = {};
  for (const [key, tags] of Object.entries(FLOWS)) {
    const p = pickLabel(g, key === "revenue" ? [...tags, "_BankRevenue"] : tags, "USD");
    if (p) { labels[key] = p.tag; lines[key] = quartersAndYears(p.m); }
  }
  for (const [key, tags] of Object.entries(PER_SHARE)) {
    const p = pickLabel(g, tags, key === "eps" ? "USD/shares" : "shares");
    if (p) { labels[key] = p.tag; lines[key] = quartersAndYears(p.m, { additive: false, allowEpsDerive: key === "eps" }); }
  }
  const balances = {};
  for (const [key, tags] of Object.entries(BALANCES)) {
    const p = pickLabel(g, tags, "USD");
    if (p) { labels[key] = p.tag; balances[key] = new Map([...p.m.values()].filter(r => !r.start).map(r => [r.end, r.val])); }
  }
  // Quarter-ends the company reported (revenue or profit).
  const qSet = new Set([...(lines.revenue?.q.keys() || []), ...(lines.netIncome?.q.keys() || [])]);
  const ySet = new Set([...(lines.revenue?.y.keys() || []), ...(lines.netIncome?.y.keys() || [])]);
  if (!qSet.size && !ySet.size) return null;
  const startOf = end => lines.revenue?.q.get(end)?.start || lines.netIncome?.q.get(end)?.start;

  // Fiscal names ("Q3 FY2026") from the filing whose main period ends on that date.
  const fiscal = new Map();
  const fiscalOf = new Map();
  for (const tag of [labels.netIncome, labels.revenue, "Assets"].filter(t => t && gaap[t])) {
    for (const r of gaap[tag].units?.USD || []) {
      if (!FORMS.test(r.form)) continue;
      const cur = fiscalOf.get(r.accn);
      if (!cur || r.end > cur.end) fiscalOf.set(r.accn, { end: r.end, fy: r.fy, fp: r.fp });
    }
  }
  for (const f of fiscalOf.values()) if (f.fy && f.fp && !fiscal.has(f.end)) fiscal.set(f.end, f.fp === "FY" ? { fp: "Q4", fy: f.fy } : f);

  const qv = (key, end) => lines[key]?.q.get(end) ?? null;
  const quarters = [...qSet].sort().slice(-maxQuarters).map(end => {
    const row = { end, start: startOf(end), fiscal: fiscal.has(end) ? `${fiscal.get(end).fp} FY${fiscal.get(end).fy}` : null };
    for (const key of Object.keys(FLOWS)) row[key] = qv(key, end)?.val ?? null;
    row.eps = round(qv("eps", end)?.val ?? null, 4);
    row.epsDerived = !!qv("eps", end)?.derived;
    row.dilutedShares = qv("dilutedShares", end)?.val ?? null;
    for (const key of Object.keys(BALANCES)) row[key] = balances[key]?.get(end) ?? null;
    check(row);
    return row;
  });

  const years = [...ySet].sort().slice(-maxYears).map(end => {
    const f = fiscal.get(end);
    const row = { end, fiscal: f ? `FY${f.fy}` : `FY${end.slice(0, 4)}` };
    for (const key of Object.keys(FLOWS)) row[key] = lines[key]?.y.get(end)?.val ?? null;
    row.eps = round(lines.eps?.y.get(end)?.val ?? null, 4);
    row.dilutedShares = lines.dilutedShares?.y.get(end)?.val ?? null;
    for (const key of Object.keys(BALANCES)) row[key] = balances[key]?.get(end) ?? null;
    check(row);
    return row;
  });

  return { quarters, years, ttm: ttm(quarters), labels, cik: facts.cik, entity: facts.entityName };
}

// Banks don't file one "revenue" number: it's net interest income plus fee (noninterest) income, per period.
function bankRevenue(gaap) {
  const nii = periods(gaap, "InterestIncomeExpenseNet", "USD"), fees = periods(gaap, "NoninterestIncome", "USD");
  if (!nii || !fees) return undefined;
  const rows = [];
  for (const [k, a] of nii) { const b = fees.get(k); if (b && a.start) rows.push({ ...a, val: a.val + b.val, filed: a.filed > b.filed ? a.filed : b.filed }); }
  return rows.length ? { units: { USD: rows } } : undefined;
}

// Throw out numbers that can't be right rather than show them.
function check(r) {
  if (r.revenue != null && r.revenue <= 0) r.revenue = null;
  // No EPS filed in plain form (some companies only file it per share class): profit ÷ diluted shares, flagged.
  if (r.eps == null && r.netIncome != null && r.dilutedShares > 1e6) { r.eps = round(r.netIncome / r.dilutedShares, 2); r.epsDerived = true; return finish(r); }
  // Share counts filed in the wrong unit (e.g. millions) don't match profit ÷ EPS; leave them out.
  if (r.dilutedShares != null) {
    const ok = r.eps && r.netIncome != null && Math.abs(r.eps) > 0.01 && Math.abs(r.netIncome / r.dilutedShares / r.eps - 1) < 0.5;
    if (!ok) r.dilutedShares = null;
  }
  finish(r);
}

// Lines worked out from other lines, only when every input is there.
function finish(r) {
  if (r.grossProfit == null && r.revenue != null && r.costOfRevenue != null) r.grossProfit = r.revenue - r.costOfRevenue;
  r.freeCashFlow = r.operatingCashFlow != null && r.capex != null ? r.operatingCashFlow - r.capex : null;
  r.ebitda = r.operatingIncome != null && r.depreciation != null ? r.operatingIncome + r.depreciation : null;
}

// Trailing twelve months: the last four quarters, only if they're back to back.
function ttm(quarters) {
  const last = quarters.slice(-4);
  if (last.length < 4) return null;
  for (let i = 1; i < 4; i++) if (Math.abs(len(last[i - 1].end, last[i].start) - 2) > 5) return null;
  const sum = k => (last.every(r => r[k] != null) ? last.reduce((s, r) => s + r[k], 0) : null);
  const out = { end: last[3].end, start: last[0].start };
  for (const k of [...Object.keys(FLOWS), "grossProfit", "freeCashFlow", "ebitda"]) out[k] = sum(k);
  out.eps = round(sum("eps"), 4);
  out.epsDerived = last.some(r => r.epsDerived);
  return out;
}
