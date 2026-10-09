"use client";

import { useEffect, useState } from "react";

export type WatchList = { k: string; name: string; icon: string; tickers: string[] };

/** The design's starter lists. Saved per browser for now; per account once login lands (World 7). */
export const DEFAULT_LISTS: WatchList[] = [
  { k: "tech", name: "Technology", icon: "▣", tickers: ["NVDA", "MSFT", "AAPL", "MU", "META"] },
  { k: "believe", name: "Stuff I believe in", icon: "★", tickers: ["PLTR"] },
];

const KEY = "hypr:wlists";

export function useWatchLists() {
  const [lists, setLists] = useState<WatchList[]>(DEFAULT_LISTS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length) setLists(parsed);
    } catch {}
  }, []);
  const save = (next: WatchList[]) => {
    setLists(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  };
  return [lists, save] as const;
}
