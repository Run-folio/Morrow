import type { Metadata } from "next";
import EasyTNavigation from "../easyt-navigation";
import HelpCenter from "./help-client";
import styles from "./help.module.css";

export const metadata: Metadata = {
  title: "Help Center",
  description: "Find clear answers about planning, routes, maps, itineraries, saving, bookings, travel information and privacy in Morrovia.",
  alternates: { canonical: "/journey/help" },
};

export default function HelpPage() {
  return (
    <main className={`${styles.page} morrovia-editorial-page`}>
      <EasyTNavigation landing />
      <HelpCenter />
    </main>
  );
}
