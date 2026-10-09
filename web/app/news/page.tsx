import { Page, ComingSoon } from "@/components/Page";

export const metadata = { title: "News" };

export default function NewsPage() {
  return (
    <Page title="News">
      <ComingSoon what="Every story HYPR is tracking, summarised" quest="World 6" />
    </Page>
  );
}
