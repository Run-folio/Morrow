export const MIXED_CENTRAL_AMERICA_PROMPT = "Tulum, Belize, Tikal, Antigua Guatemala and Lake Atitlan. 22 days. Culture, nature and hiking.";

export const EXPECTED_MIXED_GEOGRAPHY = [
  { canonicalPlaceId: "tulum", placeType: "city", routability: "direct_destination" },
  { canonicalPlaceId: "belize", placeType: "country", routability: "planning_area" },
  { canonicalPlaceId: "tikal", placeType: "landmark", routability: "anchor_or_poi" },
  { canonicalPlaceId: "antigua-guatemala", placeType: "city", routability: "direct_destination" },
  { canonicalPlaceId: "lake-atitlan", placeType: "natural_area", routability: "needs_base_selection" },
] as const;

export const NIKKO_CANONICAL_FIXTURE = {
  canonicalPlaceId: "nikko",
  name: "Nikko",
  country: "Japan",
  region: "Tochigi",
  coordinates: [139.6982, 36.7581] as [number, number],
};

export const NIKKO_ROUTE_FIXTURE = [
  { id: "london", name: "London Heathrow", country: "United Kingdom", coordinates: [-0.4543, 51.47] as [number, number] },
  { id: "bangkok", name: "Bangkok", country: "Thailand", coordinates: [100.5018, 13.7563] as [number, number] },
  { id: "seoul", name: "Seoul", country: "South Korea", coordinates: [126.978, 37.5665] as [number, number] },
  { id: "kanazawa", name: "Kanazawa", country: "Japan", coordinates: [136.6562, 36.5613] as [number, number] },
  { id: "tokyo", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] as [number, number] },
  { id: "nikko", ...NIKKO_CANONICAL_FIXTURE },
];
