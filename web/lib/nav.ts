/** Rail order from the design handoff. */
export const NAV = [
  { key: "overview",  label: "Overview",  href: "/",          icon: "home" },
  { key: "calendar",  label: "Calendar",  href: "/calendar",  icon: "calendar" },
  { key: "portfolio", label: "Portfolio", href: "/portfolio", icon: "portfolio" },
  { key: "search",    label: "Search",    href: "/search",    icon: "search" },
  { key: "markets",   label: "Markets",   href: "/markets",   icon: "markets" },
  { key: "sectors",   label: "Sectors",   href: "/sectors",   icon: "sectors" },
  { key: "stocks",    label: "Stocks",    href: "/stocks",    icon: "stocks" },
  { key: "news",      label: "News",      href: "/news",      icon: "news" },
  { key: "watchlist", label: "Watchlist", href: "/watchlist", icon: "watchlist" },
  { key: "screener",  label: "Screener",  href: "/screener",  icon: "screener" },
] as const;

export type IconName = (typeof NAV)[number]["icon"] | "moon" | "sun" | "settings" | "bell" | "menu";
