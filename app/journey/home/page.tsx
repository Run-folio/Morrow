import ImmersiveHome from "./immersive/immersive-home";
import { immersiveHomepageRoutes, initialImmersiveRouteIndex } from "@/lib/easyt/immersive-homepage-routes";

export const metadata = { title: "Travel your way" };
export const dynamic = "force-dynamic";

export default function EasyTHomePage() {
  const journeys = immersiveHomepageRoutes();
  return <ImmersiveHome routes={journeys} initialIndex={initialImmersiveRouteIndex(journeys)} />;
}
