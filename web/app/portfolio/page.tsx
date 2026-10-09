import { Page, ComingSoon } from "@/components/Page";

export const metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return (
    <Page title="Portfolio">
      <ComingSoon what="Holdings, sector mix, best and worst performers" quest="World 3 · quest 4" />
    </Page>
  );
}
