import { NextRequest, NextResponse } from "next/server";
import { resolveOsmPlaceDisplayName, resolvePlaceDisplayName } from "@/lib/easyt/place-display-name";
import { operationalPlaceStatus } from "@/lib/easyt/place-status";
import { localPlaceWithinCanonicalScope } from "@/lib/easyt/local-place-geography";
import { recommendationDurationMs } from "@/lib/easyt/recommendation-performance";
import { qualityControlledLocalPlaces } from "@/lib/easyt/local-place-results";
import { findCatalogPlaceById } from "@/lib/easyt/place-catalog";
import {
  firstUsefulLocalSearchWithFallback,
  localSearchProviderOutcome,
  localSearchScope,
} from "@/lib/easyt/local-search-strategy";

type OverpassElement = {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type LocalPlace = {
  id: string;
  name: string;
  nativeName?: string;
  address: string;
  category: string;
  coordinates: [number, number];
  mapsUrl: string;
  distanceKm: number;
  operational?: true;
  availability: "available" | "check";
  provider: "google-places" | "openstreetmap";
  providerProductId?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
};

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | "FUTURE_OPENING";
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  primaryTypeDisplayName?: { text?: string };
};

type PhotonPlace = {
  place_id?: number;
  properties?: Record<string, string | number | undefined> & {
    osm_id?: number;
    name?: string;
    type?: string;
    osm_value?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    locality?: string;
    country?: string;
    postcode?: string;
  };
  geometry?: { coordinates?: [number, number] };
};

function photonNameTags(properties: NonNullable<PhotonPlace["properties"]>) {
  return Object.fromEntries(
    Object.entries(properties).filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1].trim())),
  );
}

function addressFor(tags: Record<string, string>, fallback: string) {
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const locality = tags["addr:city"] || tags["addr:district"] || tags["addr:suburb"];
  return [street, locality, tags["addr:postcode"], fallback].filter(Boolean).join(", ");
}

function distanceKm(latitude: number, longitude: number, targetLatitude: number, targetLongitude: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const a = Math.sin(radians(targetLatitude - latitude) / 2) ** 2
    + Math.cos(radians(latitude)) * Math.cos(radians(targetLatitude)) * Math.sin(radians(targetLongitude - longitude) / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function validPhotonCategory(kind: "restaurant" | "stay", properties: NonNullable<PhotonPlace["properties"]>) {
  const category = `${properties.osm_value ?? ""} ${properties.type ?? ""}`.toLocaleLowerCase();
  return kind === "stay"
    ? /\b(?:hotel|hostel|guest_house|guesthouse|motel|apartment)\b/.test(category)
    : /\b(?:restaurant|cafe|café|fast_food)\b/u.test(category);
}

async function photonFallback(kind: "restaurant" | "stay", city: string, country: string, latitude: number, longitude: number, locale: string, radiusKm: number) {
  const term = kind === "stay" ? "hotel" : "restaurant";
  const destinationQuery = [term, city === "your location" ? "" : city, country].filter(Boolean).join(" ");
  const response = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q: destinationQuery, lat: String(latitude), lon: String(longitude), limit: "20", lang: locale })}`, {
    headers: { "User-Agent": "Journey local venue finder (portfolio prototype)" },
    next: { revalidate: 60 * 60 * 12 },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return [];
  const data = await response.json() as { features?: PhotonPlace[] };
  const places: LocalPlace[] = [];
  for (const place of data.features ?? []) {
      const properties = place.properties ?? {};
      const [lon, lat] = place.geometry?.coordinates ?? [];
      const displayName = resolveOsmPlaceDisplayName(photonNameTags(properties), locale);
      if (!displayName || !validPhotonCategory(kind, properties) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (!localPlaceWithinCanonicalScope({
        anchor: [longitude, latitude], candidate: [lon!, lat!], radiusKm,
        requestedCountry: country, candidateCountry: typeof properties.country === "string" ? properties.country : undefined,
      })) continue;
      const { name, nativeName } = displayName;
      const address = [properties.housenumber, properties.street, properties.locality || properties.city, properties.postcode, properties.country || country].filter(Boolean).join(", ") || `${city}, ${country}`;
      const searchQuery = `${name}, ${address}`;
      const china = /china/i.test(country);
      places.push({
        id: `photon-${properties.osm_id ?? `${lat}-${lon}`}`,
        name,
        ...(nativeName ? { nativeName } : {}),
        address,
        category: properties.osm_value || properties.type || kind,
        coordinates: [lon, lat] as [number, number],
        mapsUrl: china
          ? `https://www.amap.com/search?query=${encodeURIComponent(searchQuery)}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`,
        distanceKm: distanceKm(latitude, longitude, lat!, lon!),
        availability: "check" as "check",
        provider: "openstreetmap" as "openstreetmap",
      });
  }
  return qualityControlledLocalPlaces(places);
}

async function googleOperationalPlaces(kind: "restaurant" | "stay", country: string, latitude: number, longitude: number, locale: string, radiusKm: number) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("Google Places lookup unavailable");
  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.googleMapsUri,places.rating,places.userRatingCount,places.priceLevel,places.primaryTypeDisplayName",
    },
    body: JSON.stringify({
      includedTypes: [kind === "stay" ? "lodging" : "restaurant"],
      maxResultCount: 12,
      rankPreference: kind === "stay" ? "DISTANCE" : "POPULARITY",
      locationRestriction: { circle: { center: { latitude, longitude }, radius: radiusKm * 1_000 } },
      languageCode: locale,
    }),
    next: { revalidate: 60 * 15 },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error("Google Places lookup unavailable");
  const seen = new Set<string>();
  return qualityControlledLocalPlaces(((await response.json() as { places?: GooglePlace[] }).places ?? [])
    .flatMap((place) => {
      const displayName = resolvePlaceDisplayName({ defaultName: place.displayName?.text }, locale);
      const lat = place.location?.latitude;
      const lon = place.location?.longitude;
      if (!displayName || !place.id || !Number.isFinite(lat) || !Number.isFinite(lon) || place.businessStatus !== "OPERATIONAL") return [];
      if (!localPlaceWithinCanonicalScope({ anchor: [longitude, latitude], candidate: [lon!, lat!], radiusKm })) return [];
      const { name, nativeName } = displayName;
      const key = `${name}|${place.formattedAddress ?? ""}`.toLocaleLowerCase();
      if (seen.has(key)) return [];
      seen.add(key);
      const searchQuery = `${name}, ${place.formattedAddress ?? country}`;
      return [{
        id: `google-${place.id}`,
        name,
        ...(nativeName ? { nativeName } : {}),
        address: place.formattedAddress ?? country,
        category: place.primaryTypeDisplayName?.text?.trim() || (kind === "stay" ? "lodging" : "restaurant"),
        coordinates: [lon!, lat!] as [number, number],
        mapsUrl: place.googleMapsUri ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`,
        distanceKm: distanceKm(latitude, longitude, lat!, lon!),
        operational: operationalPlaceStatus({ provider: "google-places", businessStatus: place.businessStatus }),
        availability: "check" as const,
        provider: "google-places" as const,
        providerProductId: place.id,
        rating: place.rating,
        reviewCount: place.userRatingCount,
        priceLevel: place.priceLevel && place.priceLevel !== "PRICE_LEVEL_UNSPECIFIED" ? place.priceLevel : undefined,
      } satisfies LocalPlace];
    }));
}

async function openStreetMapPlaces(kind: "restaurant" | "stay", city: string, country: string, latitude: number, longitude: number, locale: string, radiusKm: number) {
  const radius = Math.round(radiusKm * 1_000);
  const matcher = kind === "stay"
    ? '["tourism"~"^(hotel|hostel|guest_house|motel)$"]'
    : '["amenity"~"^(restaurant|cafe|fast_food)$"]';
  const query = `[out:json][timeout:18];nwr(around:${radius},${latitude},${longitude})${matcher}["name"];out center tags 35;`;
  const response = await fetch(`https://overpass.kumi.systems/api/interpreter?${new URLSearchParams({ data: query })}`, {
    headers: { "User-Agent": "Journey local venue finder (portfolio prototype)" },
    next: { revalidate: 60 * 60 * 12 },
    signal: AbortSignal.timeout(4500),
  });
  if (!response.ok) throw new Error("Local venue lookup unavailable");
  const data = await response.json() as { elements?: OverpassElement[] };
  const seen = new Set<string>();
  const places: LocalPlace[] = [];
  for (const place of data.elements ?? []) {
    const tags = place.tags ?? {};
    const lat = place.lat ?? place.center?.lat;
    const lon = place.lon ?? place.center?.lon;
    const displayName = resolveOsmPlaceDisplayName(tags, locale);
    if (!displayName || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!localPlaceWithinCanonicalScope({
      anchor: [longitude, latitude], candidate: [lon!, lat!], radiusKm: radius / 1_000,
      requestedCountry: country, candidateCountry: tags["addr:country"],
    })) continue;
    const { name, nativeName } = displayName;
    const address = addressFor(tags, country ? `${city}, ${country}` : city);
    const searchQuery = `${name}, ${address}`;
    const china = /china/i.test(country);
    places.push({
      id: `${place.id}`,
      name,
      ...(nativeName ? { nativeName } : {}),
      address,
      category: tags.cuisine || tags.tourism || tags.amenity || kind,
      coordinates: [lon!, lat!] as [number, number],
      mapsUrl: china
        ? `https://www.amap.com/search?query=${encodeURIComponent(searchQuery)}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`,
      distanceKm: distanceKm(latitude, longitude, lat!, lon!),
      availability: "check",
      provider: "openstreetmap",
    });
  }
  return qualityControlledLocalPlaces(places)
    .filter((place) => {
      const key = `${place.name}|${place.address}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  const baseResponse = (body: Record<string, unknown>) => NextResponse.json(body, {
    headers: { "Server-Timing": `first-base;dur=${recommendationDurationMs(startedAt, performance.now())}` },
  });
  const city = request.nextUrl.searchParams.get("city")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const canonicalPlaceId = request.nextUrl.searchParams.get("canonicalPlaceId")?.trim();
  const kind = request.nextUrl.searchParams.get("kind") === "stay" ? "stay" : "restaurant";
  const requestedLatitude = Number(request.nextUrl.searchParams.get("lat"));
  const requestedLongitude = Number(request.nextUrl.searchParams.get("lon"));
  const requestedLocale = request.nextUrl.searchParams.get("locale")?.trim().toLocaleLowerCase() || "en";
  const locale = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(requestedLocale) ? requestedLocale : "en";
  const catalogPlace = canonicalPlaceId ? findCatalogPlaceById(canonicalPlaceId) : undefined;
  const normalized = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const catalogMatchesRequest = Boolean(catalogPlace
    && (!country || catalogPlace.parentCountries.some((candidate) => normalized(candidate) === normalized(country)))
    && [catalogPlace.canonicalName, ...catalogPlace.aliases].some((candidate) => normalized(candidate) === normalized(city ?? "")));
  const canonicalCoordinates = catalogMatchesRequest && catalogPlace?.coordinates
    ? [catalogPlace.coordinates[0], catalogPlace.coordinates[1]] as [number, number]
    : null;
  const requestedCoordinatesValid = Number.isFinite(requestedLatitude)
    && Number.isFinite(requestedLongitude)
    && Math.abs(requestedLatitude) <= 90
    && Math.abs(requestedLongitude) <= 180;
  const [longitude, latitude] = requestedCoordinatesValid
    ? [requestedLongitude, requestedLatitude]
    : canonicalCoordinates ?? [Number.NaN, Number.NaN];
  if (!city || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ places: [], searchStatus: "failed", unavailable: true }, { status: 400 });
  }

  try {
    // Google and OSM remain independent immediate lanes. Exactly one bounded,
    // destination-aware Photon fallback is hedged after one second, so a slow
    // provider cannot block useful local results. Live stay inventory remains
    // a separate client request and is never inferred here.
    const scope = localSearchScope(kind, catalogMatchesRequest ? catalogPlace?.placeType : undefined);
    const outcome = await firstUsefulLocalSearchWithFallback([
      () => localSearchProviderOutcome(() => googleOperationalPlaces(kind, country ?? "", latitude, longitude, locale, scope.primaryRadiusKm)),
      () => localSearchProviderOutcome(() => openStreetMapPlaces(kind, city, country ?? "", latitude, longitude, locale, scope.primaryRadiusKm)),
    ], () => localSearchProviderOutcome(() => photonFallback(
      kind,
      city,
      country ?? "",
      latitude,
      longitude,
      locale,
      scope.fallbackRadiusKm,
    )));
    if (outcome.state === "ready") {
      const source = outcome.places[0]?.provider === "google-places" ? "Google Places" : "OpenStreetMap";
      return baseResponse({ places: outcome.places, source, inventory: false, searchStatus: "ready" });
    }
    return baseResponse({
      places: [],
      source: "OpenStreetMap",
      inventory: false,
      searchStatus: outcome.state,
      ...(outcome.state === "failed" ? { unavailable: true } : {}),
    });
  } catch {
    // Keep the response shape stable so the client can retain its day and map
    // context even when every bounded mapped-place source is unavailable.
    return baseResponse({ places: [], source: "OpenStreetMap", searchStatus: "failed", unavailable: true });
  }
}
