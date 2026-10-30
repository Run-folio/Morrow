import { notFound } from "next/navigation";
import { releaseAvailability } from "@/lib/easyt/release-availability";
import PassportDestinationClient from "./passport-destination-client";

export const metadata = {
  title: "Passport to Destination",
  description: "Find official entry and visa sources for your passport and destination.",
};

export default function PassportDestinationPage() {
  if (!releaseAvailability.passportInfo) notFound();
  return <PassportDestinationClient />;
}
