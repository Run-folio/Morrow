import ImmersiveHome from "@/app/journey/home/immersive/immersive-home";
import { immersiveHomepageRoutes, initialImmersiveRouteIndex } from "@/lib/easyt/immersive-homepage-routes";
import { discoveryCatalogue } from "@/lib/easyt/discovery-catalogue";
import { publicRoutePublishedFamilies } from "@/lib/easyt/public-route";
import {homepageEligibleRouteCards} from '@/lib/easyt/homepage-routes';

/** Single server-rendered owner for the canonical public homepage. */
function createHomepagePresentation() {
  const journeys = immersiveHomepageRoutes();
  const homepageKeys = new Set(journeys.map((route) => route.key));
  const previewRoutes = discoveryCatalogue(publicRoutePublishedFamilies().filter((route) => homepageKeys.has(route.key)));
  return { routes: journeys, previewRoutes, eligibleCards: homepageEligibleRouteCards() };
}

// Deployment-owned public route/image metadata is static. Keep it on the
// server; no account, input, trip or request state is shared between visitors.
let homepagePresentation: ReturnType<typeof createHomepagePresentation> | undefined;
export default function MorroviaHomepage() {
  const presentation = homepagePresentation ?? (homepagePresentation = createHomepagePresentation());
  const {routes: journeys,previewRoutes,eligibleCards}=structuredClone(presentation);
  return <ImmersiveHome routes={journeys} previewRoutes={previewRoutes} initialIndex={initialImmersiveRouteIndex(journeys, Math.random, eligibleCards)} />;
}
