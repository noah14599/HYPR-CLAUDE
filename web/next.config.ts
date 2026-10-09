import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build to plain static files (web/out) that Netlify serves directly; the app runs in the browser.
  output: "export",
  // Hide the floating dev-mode badge; it sits on top of the bottom of the side rail.
  devIndicators: false,
};

export default nextConfig;
