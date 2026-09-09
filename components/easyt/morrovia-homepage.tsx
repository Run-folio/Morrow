import ImmersiveHome from "@/app/journey/home/immersive/immersive-home";
import { immersiveHomepageRoutes, initialImmersiveRouteIndex } from "@/lib/easyt/immersive-homepage-routes";

/** Single server-rendered owner for the canonical public homepage. */
export default function MorroviaHomepage() {
  const journeys = immersiveHomepageRoutes();
  return <ImmersiveHome routes={journeys} initialIndex={initialImmersiveRouteIndex(journeys)} />;
}
