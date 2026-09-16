import { NextRequest, NextResponse } from "next/server";
import { searchOpenWorldNearbyBaseSuggestions } from "@/lib/easyt/open-world-place.server";
import {
  catalogDayTripPlaces,
  dayTripPlacesFromProvider,
  MAXIMUM_DAY_TRIP_DISTANCE_KM,
} from "@/lib/easyt/day-trip-discovery";

export async function GET(request: NextRequest) {
  const destination = request.nextUrl.searchParams.get("destination")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const canonicalPlaceId = request.nextUrl.searchParams.get("canonicalPlaceId")?.trim();
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  if (!destination || !country || destination.length > 120 || country.length > 120
    || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ places: [], searchStatus: "failed", unavailable: true }, { status: 400 });
  }

  const catalogFallback = () => catalogDayTripPlaces({
    destination,
    country,
    canonicalPlaceId,
    coordinates: [longitude, latitude],
  });

  try {
    const suggestions = await searchOpenWorldNearbyBaseSuggestions({
      canonicalPlaceId,
      canonicalName: destination,
      placeType: "city",
      parentCountries: [country],
      // A day trip may legitimately cross an adjacent administrative region;
      // country containment and the bounded radius remain the safe boundary.
      parentRegionId: undefined,
      coordinates: [longitude, latitude],
    }, { limit: 8, maximumDistanceKm: MAXIMUM_DAY_TRIP_DISTANCE_KM });
    const providerPlaces = dayTripPlacesFromProvider(destination, suggestions);
    if (providerPlaces.length) return NextResponse.json({
      places: providerPlaces,
      source: "OpenStreetMap/Photon",
      searchStatus: "ready",
      radiusKm: MAXIMUM_DAY_TRIP_DISTANCE_KM,
    });
    const fallbackPlaces = catalogFallback();
    return NextResponse.json({
      places: fallbackPlaces,
      source: fallbackPlaces.length ? "Morrovia reviewed place catalog" : "OpenStreetMap/Photon",
      searchStatus: fallbackPlaces.length ? "ready" : "empty",
      fallback: fallbackPlaces.length > 0,
      radiusKm: MAXIMUM_DAY_TRIP_DISTANCE_KM,
    });
  } catch {
    const fallbackPlaces = catalogFallback();
    return NextResponse.json({
      places: fallbackPlaces,
      source: fallbackPlaces.length ? "Morrovia reviewed place catalog" : "OpenStreetMap/Photon",
      searchStatus: fallbackPlaces.length ? "ready" : "failed",
      fallback: fallbackPlaces.length > 0,
      ...(fallbackPlaces.length ? {} : { unavailable: true }),
      radiusKm: MAXIMUM_DAY_TRIP_DISTANCE_KM,
    });
  }
}
