import { NextRequest, NextResponse } from "next/server";
import { resolveOsmPlaceDisplayName, resolvePlaceDisplayName } from "@/lib/easyt/place-display-name";
import { operationalPlaceStatus } from "@/lib/easyt/place-status";
import { localPlaceWithinCanonicalScope } from "@/lib/easyt/local-place-geography";
import { firstUsefulRecommendationResults } from "@/lib/easyt/recommendation-performance";
import { qualityControlledLocalPlaces } from "@/lib/easyt/local-place-results";

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

async function photonFallback(kind: "restaurant" | "stay", city: string, country: string, latitude: number, longitude: number, locale: string) {
  const term = kind === "stay" ? "hotel" : "restaurant";
  const response = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q: term, lat: String(latitude), lon: String(longitude), limit: "12", lang: locale })}`, {
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
      if (!displayName || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (!localPlaceWithinCanonicalScope({
        anchor: [longitude, latitude], candidate: [lon!, lat!], radiusKm: kind === "stay" ? 7.5 : 5,
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

async function googleOperationalPlaces(kind: "restaurant" | "stay", country: string, latitude: number, longitude: number, locale: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
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
      locationRestriction: { circle: { center: { latitude, longitude }, radius: kind === "stay" ? 7000 : 5000 } },
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
      if (!localPlaceWithinCanonicalScope({ anchor: [longitude, latitude], candidate: [lon!, lat!], radiusKm: kind === "stay" ? 7 : 5 })) return [];
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
        rating: place.rating,
        reviewCount: place.userRatingCount,
        priceLevel: place.priceLevel && place.priceLevel !== "PRICE_LEVEL_UNSPECIFIED" ? place.priceLevel : undefined,
      } satisfies LocalPlace];
    }));
}

async function openStreetMapPlaces(kind: "restaurant" | "stay", city: string, country: string, latitude: number, longitude: number, locale: string) {
  const radius = kind === "stay" ? 7500 : 5000;
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
  const city = request.nextUrl.searchParams.get("city")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const kind = request.nextUrl.searchParams.get("kind") === "stay" ? "stay" : "restaurant";
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  const requestedLocale = request.nextUrl.searchParams.get("locale")?.trim().toLocaleLowerCase() || "en";
  const locale = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(requestedLocale) ? requestedLocale : "en";
  if (!city || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ places: [] }, { status: 400 });
  }

  try {
    // Restaurant sources are equivalent mapped-place lanes, so return the first
    // useful bounded response. Stay discovery races the richer operational
    // Google lane against mapped results; live date-specific inventory remains
    // a separate client request and is never inferred here.
    let primaryFailureCount = 0;
    const providerRequests = kind === "stay"
      ? [
          () => googleOperationalPlaces(kind, country ?? "", latitude, longitude, locale).then((places) => places ?? []),
          () => openStreetMapPlaces(kind, city, country ?? "", latitude, longitude, locale),
        ]
      : [
          () => googleOperationalPlaces(kind, country ?? "", latitude, longitude, locale).then((places) => places ?? []),
          () => openStreetMapPlaces(kind, city, country ?? "", latitude, longitude, locale),
          () => photonFallback(kind, city, country ?? "", latitude, longitude, locale),
        ];
    const primaryRequests = providerRequests.map((request) => async () => {
      try { return await request(); }
      catch { primaryFailureCount += 1; return []; }
    });
    const places = await firstUsefulRecommendationResults(primaryRequests);
    if (places.length) {
      const source = places[0]?.provider === "google-places" ? "Google Places" : "OpenStreetMap";
      return NextResponse.json({ places, source, inventory: false });
    }
    // Photon remains a bounded second-stage stay fallback when neither Google
    // nor Overpass yields a usable property. It is already part of the initial
    // restaurant race above, so it is never requested twice for food.
    if (kind === "stay") {
      const fallback = await photonFallback(kind, city, country ?? "", latitude, longitude, locale);
      return NextResponse.json({ places: fallback, source: "OpenStreetMap", inventory: false });
    }
    return NextResponse.json({ places: [], source: "OpenStreetMap", inventory: false, ...(primaryFailureCount === providerRequests.length ? { unavailable: true } : {}) });
  } catch {
    // Keep the response shape stable so the client can retain its day and map
    // context even when every bounded mapped-place source is unavailable.
    return NextResponse.json({ places: [], source: "OpenStreetMap", unavailable: true });
  }
}
