import { NextRequest, NextResponse } from "next/server";
import { needsDestinationConfirmation } from "@/lib/easyt/destination-resolution";
import { searchNominatimTravelCandidates, type NominatimTravelCandidate } from "@/lib/easyt/nominatim-place.server";

function normalise(value: string) {
  return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
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
    taiwan: ["taiwan"],
  };
  return returned === requested || (aliases[requested] ?? []).includes(returned);
}

function distanceFrom(nearby: [number, number] | undefined, candidate: NominatimTravelCandidate) {
  if (!nearby || !candidate.coordinates) return 0;
  const [longitude, latitude] = candidate.coordinates;
  const [nearbyLon, nearbyLat] = nearby;
  const radians = Math.PI / 180;
  const deltaLat = (latitude - nearbyLat) * radians;
  const deltaLon = (longitude - nearbyLon) * radians;
  const area = Math.sin(deltaLat / 2) ** 2 + Math.cos(nearbyLat * radians) * Math.cos(latitude * radians) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(area), Math.sqrt(1 - area));
}

function responseCandidate(candidate: NominatimTravelCandidate) {
  return {
    canonicalPlaceId: `nominatim:${candidate.providerId}`,
    name: candidate.canonicalName,
    country: candidate.country,
    countryCode: candidate.countryCode,
    region: candidate.region,
    providerId: candidate.providerId,
    coordinates: candidate.coordinates,
    kind: candidate.placeType,
    locality: candidate.locality,
    routability: candidate.routability,
  };
}

export async function GET(request: NextRequest) {
  const place = request.nextUrl.searchParams.get("place")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const nearLat = Number(request.nextUrl.searchParams.get("nearLat"));
  const nearLon = Number(request.nextUrl.searchParams.get("nearLon"));
  const nearby = Number.isFinite(nearLat) && Number.isFinite(nearLon) ? [nearLon, nearLat] as [number, number] : undefined;
  if (!place || place.length > 140 || (country && country.length > 100)) return NextResponse.json({ result: null }, { status: 400 });

  try {
    const candidates = (await searchNominatimTravelCandidates(place, {
      travelIntent: "route-stop",
      ...(country ? { countryNames: [country] } : {}),
    }))
      .filter((candidate) => !country || matchesCountry(candidate.country, country))
      .sort((left, right) => (right.rankScore ?? 0) - (left.rankScore ?? 0) || distanceFrom(nearby, left) - distanceFrom(nearby, right));

    if (request.nextUrl.searchParams.get("candidates") === "1") {
      return NextResponse.json({ candidates: candidates.slice(0, 4).map(responseCandidate) });
    }

    const countries = candidates.map((candidate) => candidate.country);
    const selected = !country && needsDestinationConfirmation(countries, Boolean(nearby)) ? undefined : candidates[0];
    // Free-text stops and origins must be actual route endpoints. Broad areas
    // remain available as clarification candidates, not fake centroid stops.
    if (!selected || selected.routability !== "direct_destination") return NextResponse.json({ result: null });
    return NextResponse.json({ result: responseCandidate(selected) });
  } catch {
    return NextResponse.json({ result: null });
  }
}
