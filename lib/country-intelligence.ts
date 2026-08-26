export type CountryDestinationSignal = {
  name: string;
  kind: "city" | "landmark" | "region";
  annualVisitors?: string;
  growth?: string;
};

export type CountryIntelligence = {
  visitorVolume: string;
  dataYear: number;
  source: string;
  sourceUrl: string;
  peak: { period: string; month: string; share: string };
  offPeak: { period: string; month: string; share: string };
  bookingLeadTime: string;
  transportSignals: string[];
  planningNote: string;
  preferredFirstBase: string;
  topDestinations: CountryDestinationSignal[];
};

// Discovery and planning signals only. Entry requirements, health, safety and
// other high-stakes travel advice intentionally belong to authoritative sources.
export const countryIntelligence: Record<string, CountryIntelligence> = {
  peru: {
    visitorVolume: "3.42M international visitors", dataYear: 2025,
    source: "MINCETUR / UNWTO World Tourism Barometer (via Visitors Per Year)", sourceUrl: "https://visitorsperyear.com/country/PER",
    peak: { period: "Dry season", month: "Jul", share: "12%" }, offPeak: { period: "Rainy season", month: "Nov", share: "6%" },
    bookingLeadTime: "Reserve Machu Picchu and the rail leg several months ahead in the dry-season peak.",
    transportSignals: ["PeruRail / Inca Rail for Machu Picchu", "Cruz del Sur for long-distance bus legs", "Allow 1–2 days to acclimatise in Cusco"],
    planningNote: "Route the highlands as Cusco → Sacred Valley → Machu Picchu; do not treat them as isolated day trips from Lima.", preferredFirstBase: "Cusco",
    topDestinations: [
      { name: "Cusco", kind: "city", annualVisitors: "2.8M", growth: "+67.9%" }, { name: "Lima", kind: "city", annualVisitors: "2.2M", growth: "+42.8%" }, { name: "Machu Picchu", kind: "landmark", annualVisitors: "1.8M", growth: "+89.3%" }, { name: "Sacred Valley", kind: "region", annualVisitors: "1.4M", growth: "+85.7%" }, { name: "Colca Canyon", kind: "landmark", annualVisitors: "0.7M", growth: "+67.8%" },
    ],
  },
  guatemala: {
    visitorVolume: "2.52M international visitors", dataYear: 2025,
    source: "INGUAT / UNWTO World Tourism Barometer (via Visitors Per Year)", sourceUrl: "https://visitorsperyear.com/country/guatemala",
    peak: { period: "Dry season", month: "Dec", share: "14%" }, offPeak: { period: "Rainy season", month: "Jun", share: "5%" },
    bookingLeadTime: "Book popular Antigua stays and Tikal logistics 2–3 months ahead for peak season.",
    transportSignals: ["Use shuttles between Antigua and Lake Atitlán", "Fly or use a long road transfer to Flores for Tikal", "Keep Semuc Champey as a dedicated transfer-and-nature chapter"],
    planningNote: "Build distinct chapters in Antigua, Atitlán and Petén instead of trying to connect all three as day trips.", preferredFirstBase: "Antigua Guatemala",
    topDestinations: [
      { name: "Guatemala City", kind: "city", annualVisitors: "1.0M", growth: "+15.6%" }, { name: "Antigua Guatemala", kind: "city", annualVisitors: "0.8M", growth: "+45.8%" }, { name: "Flores", kind: "city", annualVisitors: "0.4M", growth: "+89.2%" }, { name: "Tikal National Park", kind: "landmark", annualVisitors: "0.4M", growth: "+78.6%" }, { name: "Lake Atitlán", kind: "landmark", annualVisitors: "0.4M", growth: "+56.3%" },
    ],
  },
};

/**
 * Every country in the Top 100 gets a real, intentionally limited baseline.
 * Editorial records above add seasonality and routing signals only where we have
 * reviewed them; the fallback never invents those details.
 */
export function getCountryIntelligence(country: string): CountryIntelligence | undefined {
  const key = country.trim().toLowerCase();
  const reviewed = countryIntelligence[key];
  if (reviewed) return reviewed;
  const ranked = worldCountries.find((entry) => entry.name.toLowerCase() === key);
  if (!ranked) return undefined;
  const highlights = rankedCountryPlaces[key] ?? featuredAttractions[key] ?? [];
  return {
    visitorVolume: `${ranked.visitors} international visitors`,
    dataYear: 2025,
    source: "Visitors Per Year Top 100 ranking",
    sourceUrl: "https://visitorsperyear.com/top-100",
    peak: { period: "Seasonal pattern", month: "Check local dates", share: "N/A" },
    offPeak: { period: "Seasonal pattern", month: "Check local dates", share: "N/A" },
    bookingLeadTime: "Confirm attraction capacity, local transport and accommodation once dates are fixed.",
    transportSignals: ["Journey will add route-specific transport after places are selected."],
    planningNote: "Start with a small number of geographically compatible places, then let Journey protect realistic transfer time between them.",
    preferredFirstBase: highlights[0]?.area.split("·")[0]?.trim() || country,
    topDestinations: highlights.slice(0, 5).map((place) => ({ name: place.title, kind: place.type.toLowerCase().includes("city") ? "city" : "landmark" })),
  };
}
import { featuredAttractions, rankedCountryPlaces, worldCountries } from "@/lib/world-discovery";
