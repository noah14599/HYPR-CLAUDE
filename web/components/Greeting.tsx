"use client";

import { useEffect, useState } from "react";

/** "Good afternoon, Noah" + today's date. Rendered on the client so it uses the visitor's clock. */
export function Greeting({ className, dateClassName }: { className?: string; dateClassName?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  const [name, setName] = useState("Noah");
  useEffect(() => {
    setNow(new Date());
    try { const n = localStorage.getItem("hypr:name"); if (n) setName(n); } catch {}
  }, []);
  if (!now) return <span className={className}>&nbsp;</span>;
  const h = now.getHours();
  const word = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Still up";
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <>
      <span data-title className={className}>{word}, {name}</span>
      <span className={dateClassName}>{date}</span>
    </>
  );
}
