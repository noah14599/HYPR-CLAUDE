# HYPR news sources: limits sheet

Read from each source's own documentation and terms on 2026-10-09. The collector is built to stay inside these.
"Verified" = from the source's official page. "Unverified" = no official statement found; based on third-party reports.

| Source | What we use | Rate limit | Commercial use | How often we'll check |
|---|---|---|---|---|
| **SEC EDGAR** | Ticker→company ID list, each company's filing history, latest-filings feed | **10 requests/second** total (verified). Must send a User-Agent naming the app and a contact email (verified). Excess traffic can get the address blocked. | Free public data, anyone may use it (verified) | Latest-filings feed every 10 min; ~2–3 requests/sec at peak |
| **GDELT** (DOC 2.0 API) | Article search by company name, last 3 months | About **1 request every 5 seconds** (unverified: community docs; GDELT returns 429 if exceeded). Max 250 articles per search. | **Allowed, free, for any commercial use**, with a citation and link to gdeltproject.org (verified) | Each company every ~45 min (500 companies × 5 s) |
| **Finnhub** (free plan) | Company news by ticker | **60 calls/minute**, plus 30 calls/second cap; 429 if exceeded (verified) | Free plan terms for commercial use not yet confirmed | Each company every ~15 min at ≤ 40 calls/min |
| **Google News** (search RSS) | Stories about each company from across the web | **No published limit** (unverified). Heavy use gets 429s / CAPTCHAs; results capped ~100 per search. | **Feeds described as for non-commercial use**, with attribution to Google News if shown on a site (unverified: secondary sources; Google's own terms page not reachable) | Each company at most every 2 hours, spread evenly (~1 request per 14 s) |
| **Yahoo Finance** (per-ticker RSS) | Up to 20 recent headlines per ticker | **No published limit** (unverified). Unofficial feed; may break without notice. | Yahoo's general terms **bar commercial use without written permission** (verified, general ToS) | Each company at most every 2 hours, staggered from Google |
| **PR Newswire** | Company press releases | Not stated | Site terms **ban robots/scrapers and using content to train AI** (verified); RSS is offered to publishers, who are asked to contact them | Feed every 15–30 min |
| **Business Wire** | Company press releases | Not stated | RSS terms not found (historically free with registration) | Feed every 15–30 min |
| **GlobeNewswire** | Company press releases; feeds filterable by exchange/industry | Not stated | RSS terms not found; feeds offered to journalists and bloggers | Feed every 15–30 min |
| **MarketWatch** (Dow Jones) | Market headlines | Not stated | **Personal, non-commercial only** without written consent, RSS included (verified via Dow Jones terms) | — |
| **CNBC, Motley Fool, Benzinga** | Market headlines | Not stated | Feed-specific terms not found (Benzinga sells its news via a paid API) | Every 15–30 min if used |

## Rules the collector follows for every source
1. Honest User-Agent naming HYPR, with a contact email.
2. Its own speed limit per website, spread out over time; never bursts.
3. "Only if changed" requests (ETag / If-Modified-Since), so repeat checks cost almost nothing.
4. On 429 / 403: back off (double the wait, up to hours) and record it on the source-health table.
5. Headlines, short summaries and links only. Full text only from public-domain or explicitly shared sources (SEC filings, press releases).
6. No IP rotation, disguised browsers or CAPTCHA solving.

## Open question for the owner
Several of the richest free feeds (Google News, Yahoo, MarketWatch, PR Newswire) say they're for personal or non-commercial use. HYPR plans to charge for subscriptions, which makes it commercial. We never republish their articles: we store headlines and links privately and show our own AI-written summary with a link to each source. That's how most news aggregators work, but it isn't the same as having permission. A lawyer should confirm before launch.
