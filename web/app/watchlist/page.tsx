import { Page, ComingSoon } from "@/components/Page";

export const metadata = { title: "Watchlist" };

export default function WatchlistPage() {
  return (
    <Page title="Watchlist">
      <ComingSoon what="Your lists of stocks to follow" quest="World 3 · quest 4" />
    </Page>
  );
}
