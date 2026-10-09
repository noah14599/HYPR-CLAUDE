import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter } from "next/font/google";
import { Shell } from "@/components/Shell";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "HYPR", template: "%s · HYPR" },
  description: "Every S&P 500 stock, its news in one line, and the HYPR score.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08080a",
};

// Runs before first paint: restores the saved theme and sets the desktop canvas zoom
// (designed at 1920px, scaled by min(0.85, width / 1920)) so nothing jumps on load.
const boot = `(function(){
  try { if (localStorage.getItem("hypr:theme") === "light") document.documentElement.dataset.theme = "light"; } catch (e) {}
  function fit(){
    var w = window.innerWidth, r = document.documentElement.style;
    if (w >= 1024) r.setProperty("--s", String(Math.min(0.85, w / 1920))); else r.removeProperty("--s");
  }
  fit(); window.addEventListener("resize", fit);
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body className={`${dmSans.variable} ${inter.variable}`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
