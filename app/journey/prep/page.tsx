import { redirect } from "next/navigation";

export const metadata = { title: "Overview" };

export default async function LegacyTripPrepRedirect({
  searchParams,
}: {
  searchParams: Promise<{ trip?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawTripId = Array.isArray(params.trip) ? params.trip[0] : params.trip;
  const tripId = rawTripId?.trim();
  redirect(tripId ? `/journey/${encodeURIComponent(tripId)}` : "/journey/dashboard");
}
