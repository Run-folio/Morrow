import { tripFromBuilder, type BuilderTripInput } from "@/lib/easyt/trip";

const stops: BuilderTripInput["stops"] = [
  { id: "cancun-stop", name: "Cancún", country: "Mexico", canonicalPlaceId: "cancun", coordinates: [-86.8515, 21.1619] },
  { id: "tulum", name: "Tulum", country: "Mexico", canonicalPlaceId: "tulum", coordinates: [-87.4654, 20.2114] },
  { id: "antigua", name: "Antigua Guatemala", country: "Guatemala", canonicalPlaceId: "antigua-guatemala", coordinates: [-90.7339, 14.5586] },
  { id: "caye-caulker", name: "Caye Caulker", country: "Belize", canonicalPlaceId: "caye-caulker", coordinates: [-88.0246, 17.7425] },
  { id: "belize-city", name: "Belize City", country: "Belize", canonicalPlaceId: "belize-city", coordinates: [-88.1962, 17.5046] },
  { id: "flores", name: "Flores", country: "Guatemala", canonicalPlaceId: "open-world:nominatim:node:flores", coordinates: [-89.897, 16.9294] },
];

export const cancunReturnTripFixture = tripFromBuilder({
  id: "storybook-cancun-return",
  origin: "Cancún",
  originCountry: "Mexico",
  originCanonicalPlaceId: "cancun",
  originCoordinates: [-86.8515, 21.1619],
  journeyEnd: { mode: "same_as_start" },
  stops,
  startDate: "2026-10-01",
  endDate: "2026-10-06",
  picks: {},
  mustDo: "Start in Cancún, visit Belize and Guatemala, then return to Cancún.",
  pace: "slow",
  hotels: "few",
  budget: "mid",
  nightAllocations: Object.fromEntries(stops.map((stop) => [stop.id, 1])),
  draft: stops.map((stop, index) => ({
    number: String(index + 1),
    date: `2026-10-0${index + 1}`,
    destination: stop.name,
    title: index === 0 ? "Start in Cancún" : `Travel to ${stop.name}`,
    reason: index === 0 ? "The trip begins in the first overnight location." : "Continue through the saved route.",
    items: index === 0 ? ["Settle into Cancún"] : [`Arrive in ${stop.name}`],
    type: index === 0 ? "arrival" : "activity",
  })),
});
