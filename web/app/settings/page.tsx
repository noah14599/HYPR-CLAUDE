import { Page, ComingSoon } from "@/components/Page";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Page title="Settings">
      <ComingSoon what="Account, subscription, billing, notifications and privacy" quest="World 3 · quest 4" />
    </Page>
  );
}
