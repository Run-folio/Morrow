import { NextRequest, NextResponse } from "next/server";
import { countryCodeFor } from "@/lib/easyt/country-registry";
import {
  outdoorPlacesFromOpenStreetMap,
  OUTDOOR_DISCOVERY_RADIUS_KM,
  type OutdoorMapElement,
} from "@/lib/easyt/outdoor-discovery";

const OUTDOOR_DISCOVERY_TIMEOUT_MS = 5_500;

function outdoorQuery(countryCode: string, latitude: number, longitude: number) {
  const radius = Math.round(OUTDOOR_DISCOVERY_RADIUS_KM * 1_000);
  return `[out:json][timeout:20];
area["ISO3166-1"="${countryCode}"]["boundary"="administrative"]["admin_level"="2"]->.country;
(
  nwr(area.country)(around:${radius},${latitude},${longitude})["leisure"~"^(park|garden|nature_reserve)$"]["name"];
  nwr(area.country)(around:${radius},${latitude},${longitude})["tourism"="viewpoint"]["name"];
  nwr(area.country)(around:${radius},${latitude},${longitude})["natural"~"^(beach|peak|wood)$"]["name"];
  nwr(area.country)(around:${radius},${latitude},${longitude})["natural"="water"]["water"~"^(lake|reservoir)$"]["name"];
  nwr(area.country)(around:${radius},${latitude},${longitude})["landuse"="forest"]["name"];
  nwr(area.country)(around:${radius},${latitude},${longitude})["boundary"~"^(national_park|protected_area)$"]["name"];
  relation(area.country)(around:${radius},${latitude},${longitude})["route"="hiking"]["name"];
);
out center tags 80;`;
}

export async function GET(request: NextRequest) {
  const destination = request.nextUrl.searchParams.get("destination")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const requestedCountryCode = request.nextUrl.searchParams.get("countryCode")?.trim();
  const countryCode = countryCodeFor(requestedCountryCode) ?? countryCodeFor(country);
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  if (!destination || !country || !countryCode || destination.length > 120 || country.length > 120
    || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ places: [], searchStatus: "failed", unavailable: true }, { status: 400 });
  }

  try {
    const response = await fetch(`https://overpass.kumi.systems/api/interpreter?${new URLSearchParams({ data: outdoorQuery(countryCode, latitude, longitude) })}`, {
      headers: { "User-Agent": "Morrovia outdoor discovery/1.0 (https://morrovia.com)" },
      next: { revalidate: 60 * 60 * 12 },
      signal: AbortSignal.timeout(OUTDOOR_DISCOVERY_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("Outdoor place provider unavailable");
    const payload = await response.json() as { elements?: OutdoorMapElement[] };
    const places = outdoorPlacesFromOpenStreetMap({
      destination,
      country,
      coordinates: [longitude, latitude],
      elements: payload.elements ?? [],
    });
    return NextResponse.json({
      places,
      source: "OpenStreetMap",
      searchStatus: places.length ? "ready" : "empty",
      radiusKm: OUTDOOR_DISCOVERY_RADIUS_KM,
    });
  } catch {
    return NextResponse.json({
      places: [],
      source: "OpenStreetMap",
      searchStatus: "failed",
      unavailable: true,
      radiusKm: OUTDOOR_DISCOVERY_RADIUS_KM,
    });
  }
}
