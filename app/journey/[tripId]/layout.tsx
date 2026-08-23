import { headers } from "next/headers";
import { redirect } from "next/navigation";
import EasyTNavigation from "../easyt-navigation";
import TripShell from "@/components/easyt/trip-shell";
import TripShellResolver from "@/components/easyt/trip-shell-resolver";
import { getAuth } from "@/lib/auth";
import { isEasyTAuthConfigured } from "@/lib/easyt/auth-environment";
import {
  ensureEasyTUser,
  getEasyTUserPreferences,
  getTripForOwner,
} from "@/lib/easyt/repository";

export const dynamic = "force-dynamic";

export default async function TripWorkspaceLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ tripId: string }>;
}>) {
  const { tripId } = await params;
  const workspaceHref = `/journey/${encodeURIComponent(tripId)}`;

  if (!isEasyTAuthConfigured()) {
    redirect("/journey/login?setup=required");
  }

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user?.id || !session.user.email) {
    redirect(`/journey/login?next=${encodeURIComponent(workspaceHref)}`);
  }

  await ensureEasyTUser(session.user.id, session.user.email, session.user.name);
  const [trip, preferences] = await Promise.all([
    getTripForOwner(session.user.id, tripId),
    getEasyTUserPreferences(session.user.id),
  ]);

  return (
    <main className="morrovia-editorial-page">
      <EasyTNavigation
        current="trips"
        account={{
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          language: preferences.language,
        }}
      />
      {trip
        ? <TripShell trip={trip}>{children}</TripShell>
        : <TripShellResolver tripId={tripId} ownerId={session.user.id}>{children}</TripShellResolver>}
    </main>
  );
}
