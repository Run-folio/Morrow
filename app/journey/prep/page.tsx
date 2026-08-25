import TripPrepClient from "./trip-prep-client";

export const metadata = { title: "Trip prep" };
export const dynamic = "force-dynamic";

export default function TripPrepPage() {
  return <TripPrepClient />;
}
