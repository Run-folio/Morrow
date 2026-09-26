import ImmersiveHome from "@/app/journey/home/immersive/immersive-home";
import { immersiveHomepageRoutes, initialImmersiveRouteIndex } from "@/lib/easyt/immersive-homepage-routes";
import { discoveryCatalogue } from "@/lib/easyt/discovery-catalogue";
import { publicRoutePublishedFamilies } from "@/lib/easyt/public-route";

/** Single server-rendered owner for the canonical public homepage. */
export default function MorroviaHomepage() {
  const journeys = immersiveHomepageRoutes();
  const homepageKeys = new Set(journeys.map((route) => route.key));
  const previewRoutes = discoveryCatalogue(publicRoutePublishedFamilies().filter((route) => homepageKeys.has(route.key)));
  return <ImmersiveHome routes={journeys} previewRoutes={previewRoutes} initialIndex={initialImmersiveRouteIndex(journeys)} />;
}
