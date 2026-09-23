import type { Metadata } from "next";
import { headers } from "next/headers";
import EasyTNavigation from "@/app/journey/easyt-navigation";
import { getAuth } from "@/lib/auth";
import { isEasyTAuthConfigured } from "@/lib/easyt/auth-environment";
import { getEasyTUserPreferences, getTripForOwner } from "@/lib/easyt/repository";
import PersonalRouteDeviceResolver, { PersonalRouteOwnerBoundary } from "./personal-route-access";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Your journey",
  robots: { index: false, follow: false, noarchive: true, noimageindex: true, nosnippet: true },
  openGraph: null,
  twitter: null,
};

export default async function PersonalRoutePage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const session = isEasyTAuthConfigured()
    ? await getAuth().api.getSession({ headers: await headers() })
    : null;
  if (!session?.user?.id || !session.user.email) {
    const navigation = <EasyTNavigation current="trips" logoTone="light" />;
    return <PersonalRouteDeviceResolver tripId={tripId} ownerId={null} navigation={navigation} />;
  }
  const [trip, preferences] = await Promise.all([
    getTripForOwner(session.user.id, tripId),
    getEasyTUserPreferences(session.user.id),
  ]);
  const navigation = <EasyTNavigation current="trips" logoTone="light" account={{
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    language: preferences.language,
  }} />;
  return trip
    ? <PersonalRouteOwnerBoundary trip={trip} navigation={navigation} />
    : <PersonalRouteDeviceResolver tripId={tripId} ownerId={session.user.id} navigation={navigation} />;
}
