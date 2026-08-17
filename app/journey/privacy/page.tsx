import EasyTNavigation from "../easyt-navigation";
import MorroviaFooter from "@/components/morrovia-footer";
import PrivacyNotice from "./privacy-notice";

export const metadata = {
  title: "Privacy · Morrovia",
  description: "How Morrovia collects, uses and protects travel-planning data.",
  robots: { index: true, follow: true },
};

export default function EasyTPrivacyPage() {
  return (
    <main id="main-content">
      <EasyTNavigation current="privacy" />
      <PrivacyNotice />
      <MorroviaFooter />
    </main>
  );
}
