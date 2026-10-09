"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { NAV } from "@/lib/nav";
import type { IconName } from "@/lib/nav";
import s from "./Shell.module.css";

type Tip = { label: string; y: number } | null;

function isActive(path: string, href: string | null) {
  if (!href) return false;
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState<Tip>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  useEffect(() => setOpen(false), [path]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("hypr:theme", next); } catch {}
  }

  const tipProps = (label: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ label, y: r.top + r.height / 2 });
    },
    onMouseLeave: () => setTip(null),
  });

  const item = (key: string, label: string, icon: IconName, href: string | null, extra?: React.ReactNode, onClick?: () => void) => {
    const inner = <><Icon name={icon} />{extra}<span className={s.label}>{label}</span></>;
    const common = { className: s.item, "data-nav": true, ...tipProps(label) };
    return href
      ? <Link key={key} href={href} aria-label={label} aria-current={isActive(path, href) ? "page" : undefined} {...common}>{inner}</Link>
      : <button key={key} type="button" aria-label={label} onClick={onClick} {...common}>{inner}</button>;
  };

  const themeLabel = theme === "light" ? "Dark mode" : "Light mode";

  return (
    <>
      {open && <div className={s.scrim} onClick={() => setOpen(false)} />}
      <nav className={`${s.rail} ${open ? s.railOpen : ""}`} aria-label="Main">
        <Link href="/" className={s.logo} aria-label="HYPR home" />
        <div className={s.items}>
          {NAV.map(n => item(n.key, n.label, n.icon, n.href))}
          <div className={s.spacer} />
          {item("theme", themeLabel, "moon", null, null, toggleTheme)}
          {item("settings", "Settings", "settings", "/settings")}
          {item("alerts", "Alerts", "bell", null, <span className={s.dot} />)}
          <Link href="/settings" className={s.item} data-nav aria-label="Your profile" {...tipProps("Your profile")} style={{ marginTop: 2 }}>
            <span className={s.avatar}>NS</span><span className={s.label}>Your profile</span>
          </Link>
        </div>
      </nav>
      {tip && <span className={s.tip} style={{ top: tip.y }}>{tip.label}</span>}

      <button type="button" className={s.burger} aria-label="Open menu" onClick={() => setOpen(true)}>
        <Icon name="menu" />
      </button>

      <nav className={s.tabs} aria-label="Tabs">
        {([["Overview", "home", "/"], ["Calendar", "calendar", "/calendar"], ["Watchlist", "watchlist", "/watchlist"], ["Search", "search", "/search"]] as const).map(([label, icon, href]) => (
          <Link key={href} href={href} className={s.tab} aria-label={label} aria-current={isActive(path, href) ? "page" : undefined}>
            <Icon name={icon} size={21} />
          </Link>
        ))}
        <button type="button" className={s.tab} aria-label="Menu" aria-current={open ? "page" : undefined} onClick={() => setOpen(o => !o)}>
          <span className={s.avatar} style={{ width: 26, height: 26, fontSize: 10 }}>NS</span>
        </button>
      </nav>

      <main className={s.main}>{children}</main>
    </>
  );
}
