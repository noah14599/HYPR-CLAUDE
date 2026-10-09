import { Page, ComingSoon } from "@/components/Page";

export const metadata = { title: "Markets" };

export default function MarketsPage() {
  return (
    <Page title="Markets">
      <ComingSoon what="Futures, volatility, commodities, crypto, rates and S&P 500 breadth" quest="World 3 · quest 4" />
    </Page>
  );
}
