// GET /api/news?ticker=AAPL
// The latest news stories about one company, from our news database (collected around the clock in Supabase).
// Copies of the same story are grouped; "outlets" says how many publishers carried it.
import { NextResponse } from "next/server";

type Story = { story_id: number; title: string; url: string; source: string; summary: string | null; published_at: string; outlets: number };

export async function GET(req: Request) {
  const ticker = (new URL(req.url).searchParams.get("ticker") || "").toUpperCase();
  if (!/^[A-Z.-]{1,6}$/.test(ticker)) return NextResponse.json({ error: "ticker required" }, { status: 400 });
  const base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) return NextResponse.json({ error: "SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY not set" }, { status: 500 });

  // Newest 40 stories from the last 7 days.
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const res = await fetch(
    `${base}/rest/v1/ticker_stories?select=story_id,title,url,source,summary,published_at,outlets&ticker=eq.${encodeURIComponent(ticker)}&published_at=gte.${since}&order=published_at.desc&limit=40`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, next: { revalidate: 60 } },
  );
  if (!res.ok) return NextResponse.json({ error: `news database HTTP ${res.status}` }, { status: 502 });
  const stories = (await res.json()) as Story[];
  return NextResponse.json(
    { ticker, stories },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120", "Netlify-Vary": "query" } },
  );
}
