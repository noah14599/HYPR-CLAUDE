"use client";

import dynamic from "next/dynamic";

// The app reads the browser (saved theme, watchlists, screen size) as it starts, so it renders in the browser only.
const HyprApp = dynamic(() => import("./hypr/HyprApp"), { ssr: false });

export default function Page() {
  return (
    <div id="dc-root">
      <div className="sc-host">
        <HyprApp />
      </div>
    </div>
  );
}
