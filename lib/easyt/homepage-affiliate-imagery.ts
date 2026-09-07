import inventory from "../../public/journey/immersive/asset-inventory.json" with { type: "json" };
import type { CurrentPartnerCategory } from "./booking-readiness.ts";

export function homepageAffiliateImage(routeKey: string, category: CurrentPartnerCategory) {
  return inventory.find((asset) => asset.route === routeKey && asset.category === category) ?? null;
}
