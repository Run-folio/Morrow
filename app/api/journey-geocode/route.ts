import { NextRequest, NextResponse } from "next/server";
import { needsDestinationConfirmation } from "@/lib/easyt/destination-resolution";

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
  type?: string;
  category?: string;
  addresstype?: string;
  osm_type?: string;
  osm_id?: number;
  address?: { country?: string; country_code?: string; city?: string; town?: string; village?: string; municipality?: string; county?: string; state?: string };
};

function normalise(value: string) {
  return value.toLocaleLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesCountry(returnedCountry: string | undefined, requestedCountry: string) {
  const returned = normalise(returnedCountry ?? "");
  const requested = normalise(requestedCountry);
  const aliases: Record<string, string[]> = {
    "united states": ["united states of america"],
    "united kingdom": ["united kingdom", "great britain"],
    "czech republic": ["czechia"],
    "ivory coast": ["cote divoire"],
    "south korea": ["republic of korea"],
    "taiwan": ["taiwan"],
  };
  return returned === requested || (aliases[requested] ?? []).includes(returned);
}

type NearbyContext = [number, number] | undefined;

function distanceFrom(nearby: NearbyContext, candidate: NominatimResult) {
  if (!nearby) return 0;
  const latitude = Number(candidate.lat);
  const longitude = Number(candidate.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return Number.POSITIVE_INFINITY;
  const [nearbyLon, nearbyLat] = nearby;
  const latRadians = Math.PI / 180;
  const deltaLat = (latitude - nearbyLat) * latRadians;
  const deltaLon = (longitude - nearbyLon) * latRadians;
  const area = Math.sin(deltaLat / 2) ** 2 + Math.cos(nearbyLat * latRadians) * Math.cos(latitude * latRadians) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(area), Math.sqrt(1 - area));
}

async function find(query: string, country?: string, nearby?: NearbyContext) {
  const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "8", addressdetails: "1", dedupe: "1", "accept-language": "en" });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": "Journey trip planner prototype" },
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!response.ok) return null;
  const results = await response.json() as NominatimResult[];
  // Nominatim occasionally returns an identically named place in another
  // country first. Score candidates rather than trusting the first result.
  const requested = normalise(query.split(",")[0] ?? query);
  const ranked = results
    .filter((candidate) => !country || matchesCountry(candidate.address?.country, country))
    .map((candidate) => {
      const name = normalise(candidate.name ?? candidate.display_name ?? "");
      const kind = candidate.addresstype ?? candidate.type ?? candidate.category ?? "";
      const nameMatch = name === requested ? 50 : name.includes(requested) ? 24 : 0;
      const placeKind = /city|town|village|suburb|neighbourhood|county|state|province|administrative|island|peak|park|attraction|museum|historic/.test(kind) ? 12 : 0;
      return { candidate, score: nameMatch + placeKind, distance: distanceFrom(nearby, candidate) };
    })
    .sort((a, b) => b.score - a.score || a.distance - b.distance);
  // A bare place name with credible matches in more than one country is not a
  // stable routing identity. Ask the caller to provide trip context or let the
  // traveller choose instead of persisting an arbitrary global match.
  const countries = ranked.map(({ candidate }) => candidate.address?.country ?? "");
  const result = !country && needsDestinationConfirmation(countries, Boolean(nearby)) ? undefined : ranked[0]?.candidate;
  if (!result) return null;
  const latitude = Number(result?.lat);
  const longitude = Number(result?.lon);
  const isCountry = result.type === "country" || result.addresstype === "country";
  if (isCountry || !Number.isFinite(latitude) || !Number.isFinite(longitude) || (country && !matchesCountry(result.address?.country, country))) return null;
  const friendlyName = !country && result.name && normalise(result.name).includes(normalise(query)) ? query : result.name ?? result.display_name;
  return {
    coordinates: [longitude, latitude] as [number, number],
    name: friendlyName,
    country: result.address?.country,
    countryCode: result.address?.country_code?.toUpperCase(),
    region: result.address?.state ?? result.address?.county,
    providerId: result.osm_type && result.osm_id ? `${result.osm_type}:${result.osm_id}` : undefined,
    kind: result.addresstype ?? result.type ?? result.category ?? "place",
    locality: result.address?.city ?? result.address?.town ?? result.address?.village ?? result.address?.municipality ?? result.address?.county ?? result.address?.state,
  };
}

async function candidatesFor(place: string, preferredCountry?: string, nearby?: NearbyContext) {
  const params = new URLSearchParams({ q: place, format: "jsonv2", limit: "8", addressdetails: "1", dedupe: "1", "accept-language": "en" });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": "Morrovia trip planner" },
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!response.ok) return [];
  const requested = normalise(place);
  const seen = new Set<string>();
  return (await response.json() as NominatimResult[])
    .filter((result) => {
      const name = normalise(result.name ?? result.display_name ?? "");
      const kind = result.addresstype ?? result.type ?? result.category ?? "";
      return (name === requested || name.includes(requested))
        && /city|town|village|suburb|neighbourhood|county|state|province|administrative|island|peak|park|attraction|museum|historic/.test(kind)
        && Boolean(result.address?.country)
        && (!preferredCountry || matchesCountry(result.address?.country, preferredCountry));
    })
    .map((result) => ({
      name: result.name ?? result.display_name ?? place,
      country: result.address!.country!,
      countryCode: result.address?.country_code?.toUpperCase(),
      region: result.address?.state ?? result.address?.county,
      providerId: result.osm_type && result.osm_id ? `${result.osm_type}:${result.osm_id}` : undefined,
      coordinates: [Number(result.lon), Number(result.lat)] as [number, number],
      kind: result.addresstype ?? result.type ?? result.category ?? "place",
      locality: result.address?.city ?? result.address?.town ?? result.address?.village ?? result.address?.municipality ?? result.address?.county ?? result.address?.state,
    }))
    .filter((result) => Number.isFinite(result.coordinates[0]) && Number.isFinite(result.coordinates[1]))
    .sort((a, b) => {
      const countryScore = Number(matchesCountry(b.country, preferredCountry ?? "")) - Number(matchesCountry(a.country, preferredCountry ?? ""));
      return countryScore || distanceFrom(nearby, { lat: String(a.coordinates[1]), lon: String(a.coordinates[0]) }) - distanceFrom(nearby, { lat: String(b.coordinates[1]), lon: String(b.coordinates[0]) });
    })
    .filter((result) => {
      const key = `${normalise(result.name)}|${normalise(result.country)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

export async function GET(request: NextRequest) {
  const place = request.nextUrl.searchParams.get("place")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const nearLat = Number(request.nextUrl.searchParams.get("nearLat"));
  const nearLon = Number(request.nextUrl.searchParams.get("nearLon"));
  const nearby = Number.isFinite(nearLat) && Number.isFinite(nearLon) ? [nearLon, nearLat] as [number, number] : undefined;
  if (!place || place.length > 140 || (country && country.length > 100)) return NextResponse.json({ result: null }, { status: 400 });

  try {
    if (request.nextUrl.searchParams.get("candidates") === "1") {
      return NextResponse.json({ candidates: await candidatesFor(place, country ?? undefined, nearby) });
    }
    // This endpoint validates an actual city, region or attraction. It no longer
    // falls back to a country centroid: a user should never believe they added a
    // real stop when the result is only a broad country match.
    const exact = await find(country ? `${place}, ${country}` : place, country ?? undefined, nearby);
    return NextResponse.json({ result: exact });
  } catch {
    return NextResponse.json({ result: null });
  }
}
