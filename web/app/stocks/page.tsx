import { Page, Card } from "@/components/Page";
import { StockRow } from "@/components/StockRow";
import { STOCKS } from "@/lib/stocks";

export const metadata = { title: "Stocks" };

export default function StocksPage() {
  const sorted = [...STOCKS].sort((a, b) => a.t.localeCompare(b.t));
  return (
    <Page title="All stocks" sub={`${sorted.length} S&P 500 companies`}>
      <Card style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", columnGap: 12 }}>
        {sorted.map(st => <StockRow key={st.t} stock={st} />)}
      </Card>
    </Page>
  );
}
