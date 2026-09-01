import { redirect } from "next/navigation";

export default async function TripPrepWorkspaceRedirect({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  redirect(`/journey/${encodeURIComponent(tripId)}`);
}
