import Link from "next/link";
import { notFound } from "next/navigation";
import { Page, ComingSoon } from "@/components/Page";
import { Logo } from "@/components/StockRow";
import { STOCKS, getStock } from "@/lib/stocks";
import { scoreColor } from "@/lib/score";

type Props = { params: Promise<{ ticker: string }> };

// Build a page for every company ahead of time, so each loads instantly.
export function generateStaticParams() {
  return STOCKS.map(s => ({ ticker: s.t }));
}

export async function generateMetadata({ params }: Props) {
  const st = getStock((await params).ticker);
  return { title: st ? `${st.name} (${st.t})` : "Stock not found" };
}

export default async function StockPage({ params }: Props) {
  const st = getStock((await params).ticker);
  if (!st) notFound();

  return (
    <Page title={<Link href="/stocks" style={{ fontSize: 12, fontWeight: 600 }}>‹ All stocks</Link>}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Logo stock={st} size={56} />
        <div>
          <div data-title style={{ fontSize: 30, letterSpacing: "-.6px" }}>{st.name}</div>
          <div style={{ fontSize: 13, color: "var(--c-tx4)", marginTop: 4 }}>{st.t} · {st.ex} · {st.sector}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 44, fontWeight: 700, color: scoreColor(st.score), lineHeight: 1 }}>{st.score}</div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: "var(--c-tx4)", marginTop: 6 }}>HYPR SCORE</div>
        </div>
      </div>
      <div data-title style={{ fontSize: 44 }}>
        ${st.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        <span style={{ fontSize: 15, color: "var(--c-tx4)", marginLeft: 8, fontWeight: 500 }}>USD</span>
      </div>
      <ComingSoon what="Chart, HYPR score card, summary, key stats and news" quest="World 3 · quest 3" />
    </Page>
  );
}
