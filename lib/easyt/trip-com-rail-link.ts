type RailEndpoint = { name: string; country?: string };

// Verified public route pages, 2026-10-22. These are not affiliate links or
// date/passenger searches. Never construct slugs from unverified place names.
export function tripComRailRouteUrl(from: RailEndpoint | null, to: RailEndpoint | null, mode: string): string | null {
  if (mode !== "train" || !from || !to) return null;
  const city = (endpoint: RailEndpoint) => {
    const name = endpoint.name.trim().toLowerCase();
    const country = (endpoint.country ?? "").trim().toLowerCase();
    if (name === "zhangjiajie" && country === "china") return "zhangjiajie";
    if (name === "hong kong" && ["hong kong", "china"].includes(country)) return "hong-kong";
    return null;
  };
  const origin = city(from);
  const destination = city(to);
  if (!origin || !destination || origin === destination) return null;
  return origin === "zhangjiajie"
    ? "https://www.trip.com/trains/china/route/zhangjiajie-to-hong-kong/"
    : "https://www.trip.com/trains/china/route/hong-kong-to-zhangjiajie/";
}
