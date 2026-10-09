# HYPR

Stock research dashboard: news for every S&P 500 stock, digested into a one-line summary, plus the HYPR score (0–100).

## What's here

- `web/` — the real app (Next.js). Run it locally with `npm --prefix web run dev`, then open http://localhost:3000
  - `web/app/hypr/HyprApp.tsx` — every screen. Converted one-for-one from the design prototype, so it matches it exactly; edit this file from now on.
  - `web/app/hypr/hypr.css` — the design's global styles and hover rules.
- `hypr-site/` — the original design prototype, live at https://hyprai.netlify.app
- `tools/convert-prototype.js` — the one-time converter that produced `HyprApp.tsx` (kept for the record).
- `hypr-quests.html` — the build quest log (also at https://claude.ai/artifact/JwUszqvbxndo5aeqU5osLE)
