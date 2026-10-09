import type { IconName } from "@/lib/nav";

/** Rail icons, copied path-for-path from the design. */
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, style: { flex: "none" } } as const;
  switch (name) {
    case "home":
      return <svg {...p}><path d="M3 10l9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
    case "calendar":
      return <svg {...p} strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /><circle cx="12" cy="15.4" r="2.1" /><path d="M12 11.7v.7M12 18.4v.7M8.3 15.4h.7M15 15.4h.7M9.6 13l.5.5M13.9 17.3l.5.5M14.4 13l-.5.5M10.1 17.3l-.5.5" strokeWidth={1.4} /></svg>;
    case "portfolio":
      return <svg {...p}><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" /><path d="M9.5 7v13M14.5 7v13" /></svg>;
    case "search":
      return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case "markets":
      return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" /></svg>;
    case "sectors":
      return <svg {...p}><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></svg>;
    case "stocks":
      return <svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
    case "news":
      return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
    case "watchlist":
      return <svg {...p} width={size + 2} height={size + 2} strokeWidth={1.8}><rect x="2.5" y="8.5" width="8.5" height="7" rx="2.2" /><rect x="13" y="8.5" width="8.5" height="7" rx="2.2" /><path d="M11 11.2h2" /><path d="M2.5 10.2 4.6 6.7a2 2 0 0 1 1.7-1" /><path d="M21.5 10.2 19.4 6.7a2 2 0 0 0-1.7-1" /></svg>;
    case "screener":
      return <svg {...p} strokeLinecap="round"><path d="M3.5 6h17M6 12h12M9.5 18h5" /></svg>;
    case "moon":
      return <svg {...p} strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 14.6A9 9 0 0 1 9.4 3.2 9 9 0 1 0 20.8 14.6z" /></svg>;
    case "sun":
      return <svg {...p} strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
    case "settings":
      return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>;
    case "bell":
      return <svg {...p}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
    case "menu":
      return <svg {...p} strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
  }
}
