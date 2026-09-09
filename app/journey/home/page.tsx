import { permanentRedirect } from "next/navigation";

export default function LegacyJourneyHomePage() {
  permanentRedirect("/");
}
