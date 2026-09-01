import { NextRequest, NextResponse } from "next/server";
import { needsDestinationConfirmation } from "@/lib/easyt/destination-resolution";
import { createOpenWorldPlaceProvider, searchOpenWorldTravelCandidates } from "@/lib/easyt/open-world-place.server";
import { placeCandidateWithinPlanningParent, type GeographicBounds, type PlaceProviderCandidate, type PlaceType, type PlanningParentConstraint } from "@/lib/easyt/place-intelligence";

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

function distanceFrom(nearby: [number, number] | undefined, candidate: PlaceProviderCandidate) {
  if (!nearby || !candidate.coordinates) return 0;
  const [longitude, latitude] = candidate.coordinates;
  const [nearbyLon, nearbyLat] = nearby;
  const radians = Math.PI / 180;
  const deltaLat = (latitude - nearbyLat) * radians;
  const deltaLon = (longitude - nearbyLon) * radians;
  const area = Math.sin(deltaLat / 2) ** 2 + Math.cos(nearbyLat * radians) * Math.cos(latitude * radians) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(area), Math.sqrt(1 - area));
}

function responseCandidate(candidate: PlaceProviderCandidate) {
  const country = candidate.parentCountries?.[0] ?? "";
  return {
    canonicalPlaceId: `open-world:${candidate.providerId}`,
    name: candidate.canonicalName,
    country,
    countryCode: "countryCode" in candidate && typeof candidate.countryCode === "string" ? candidate.countryCode : undefined,
    region: candidate.parentRegionId,
    providerId: candidate.providerId,
    providerSourceLabel: candidate.providerSourceLabel,
    coordinates: candidate.coordinates,
    bounds: candidate.bounds,
    kind: candidate.placeType,
    locality: candidate.placeType === "city" || candidate.placeType === "town" ? candidate.canonicalName : undefined,
    routability: candidate.routability,
  };
}

const planningParentTypes = new Set<PlaceType>(["continent", "country", "macro_region", "region", "sub_region", "island", "archipelago", "natural_area", "coast", "mountain_range", "valley", "travel_corridor"]);

function finiteQueryNumber(request: NextRequest, key: string) {
  const raw = request.nextUrl.searchParams.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function planningParentFromRequest(request: NextRequest): PlanningParentConstraint | undefined {
  const canonicalName = request.nextUrl.searchParams.get("parentName")?.trim();
  const rawType = request.nextUrl.searchParams.get("parentType")?.trim() as PlaceType | undefined;
  if (!canonicalName || !rawType || !planningParentTypes.has(rawType)) return undefined;
  const parentCountries = request.nextUrl.searchParams.getAll("parentCountry").map((country) => country.trim()).filter(Boolean);
  const boundsValues = {
    south: finiteQueryNumber(request, "parentSouth"),
    west: finiteQueryNumber(request, "parentWest"),
    north: finiteQueryNumber(request, "parentNorth"),
    east: finiteQueryNumber(request, "parentEast"),
  };
  const bounds = Object.values(boundsValues).every((value) => value !== undefined)
    ? boundsValues as GeographicBounds
    : undefined;
  return {
    canonicalPlaceId: request.nextUrl.searchParams.get("parentId")?.trim() || undefined,
    canonicalName,
    placeType: rawType,
    parentCountries: parentCountries.length ? parentCountries : rawType === "country" ? [canonicalName] : [],
    bounds,
  };
}

export async function GET(request: NextRequest) {
  const place = request.nextUrl.searchParams.get("place")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const requestedIntent = request.nextUrl.searchParams.get("intent");
  const travelIntent = requestedIntent === "planning-area" || requestedIntent === "anchor" || requestedIntent === "unknown"
    ? requestedIntent
    : "route-stop";
  const planningParent = planningParentFromRequest(request);
  const nearLat = Number(request.nextUrl.searchParams.get("nearLat"));
  const nearLon = Number(request.nextUrl.searchParams.get("nearLon"));
  const nearby = Number.isFinite(nearLat) && Number.isFinite(nearLon) ? [nearLon, nearLat] as [number, number] : undefined;
  if (!place || place.length > 140 || (country && country.length > 100)) return NextResponse.json({ result: null }, { status: 400 });

  try {
    const candidates = (await searchOpenWorldTravelCandidates(place, {
      travelIntent,
      ...(country ? { countryNames: [country], explicitCountryNames: [country] } : {}),
    }, createOpenWorldPlaceProvider()))
      .filter((candidate) => !country || matchesCountry(candidate.parentCountries?.[0], country))
      .filter((candidate) => !planningParent || placeCandidateWithinPlanningParent(candidate, planningParent))
      .sort((left, right) => (right.rankScore ?? 0) - (left.rankScore ?? 0) || distanceFrom(nearby, left) - distanceFrom(nearby, right));

    if (request.nextUrl.searchParams.get("candidates") === "1") {
      return NextResponse.json({ candidates: candidates.slice(0, 4).map(responseCandidate) });
    }

    const countries = candidates.map((candidate) => candidate.parentCountries?.[0] ?? "");
    const selected = !country && needsDestinationConfirmation(countries, Boolean(nearby)) ? undefined : candidates[0];
    // Free-text stops and origins must be actual route endpoints. Broad areas
    // remain available as clarification candidates, not fake centroid stops.
    if (!selected || selected.routability !== "direct_destination") return NextResponse.json({ result: null });
    return NextResponse.json({ result: responseCandidate(selected) });
  } catch {
    return NextResponse.json({ result: null }, { status: request.nextUrl.searchParams.get("candidates") === "1" ? 503 : 200 });
  }
}
