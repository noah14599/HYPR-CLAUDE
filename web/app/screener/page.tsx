import { Page, ComingSoon } from "@/components/Page";

export const metadata = { title: "Screener" };

export default function ScreenerPage() {
  return (
    <Page title="Screener">
      <ComingSoon what="A filterable table of every company" quest="World 3 · quest 4" />
    </Page>
  );
}
