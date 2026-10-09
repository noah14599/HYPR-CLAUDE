"use client";

import { useEffect, useState } from "react";

/** "Good afternoon, Noah" + today's date. Rendered on the client so it uses the visitor's clock. */
export function Greeting({ name }: { name: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  if (!now) return <span>&nbsp;</span>;
  const h = now.getHours();
  const word = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <>
      <span data-title style={{ fontSize: 26, letterSpacing: "-.6px" }}>{word}, {name}</span>
      <span style={{ fontSize: 13, color: "var(--c-tx4)" }}>{date}</span>
    </>
  );
}
