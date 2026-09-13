import { NextRequest, NextResponse } from "next/server";
import { searchOpenWorldNearbyBaseSuggestions } from "@/lib/easyt/open-world-place.server";

const MINIMUM_DAY_TRIP_DISTANCE_KM = 20;
const MAXIMUM_DAY_TRIP_DISTANCE_KM = 80;

export async function GET(request: NextRequest) {
  const destination = request.nextUrl.searchParams.get("destination")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const canonicalPlaceId = request.nextUrl.searchParams.get("canonicalPlaceId")?.trim();
  const region = request.nextUrl.searchParams.get("region")?.trim();
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  if (!destination || !country || destination.length > 120 || country.length > 120
    || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ places: [] }, { status: 400 });
  }

  try {
    const suggestions = await searchOpenWorldNearbyBaseSuggestions({
      canonicalPlaceId,
      canonicalName: destination,
      placeType: "city",
      parentCountries: [country],
      parentRegionId: region,
      coordinates: [longitude, latitude],
    }, { limit: 8, maximumDistanceKm: MAXIMUM_DAY_TRIP_DISTANCE_KM });
    const places = suggestions
      .filter((suggestion) => suggestion.distanceKm >= MINIMUM_DAY_TRIP_DISTANCE_KM)
      .slice(0, 8)
      .map((suggestion) => {
        const distance = Math.round(suggestion.distanceKm);
        return {
          id: `day-trip-${suggestion.canonicalPlaceId.replace(/[^a-z0-9_-]+/gi, "-")}`,
          title: suggestion.name,
          area: suggestion.label,
          type: "Day trip",
          tags: ["Day trip", "day-trips"],
          description: `A verified nearby ${suggestion.placeType} ${distance} km from ${destination}. Check current transport options before adding it to a day.`,
          coordinates: suggestion.coordinates,
          qualityScore: Math.max(6, 14 - Math.round(suggestion.distanceKm / 20)),
          distanceKm: suggestion.distanceKm,
        };
      });
    return NextResponse.json({ places, source: "OpenStreetMap/Photon", radiusKm: MAXIMUM_DAY_TRIP_DISTANCE_KM });
  } catch {
    return NextResponse.json({ places: [], unavailable: true });
  }
}
