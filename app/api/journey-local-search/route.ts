import { NextRequest, NextResponse } from "next/server";

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
  address: string;
  category: string;
  coordinates: [number, number];
  mapsUrl: string;
  distanceKm: number;
  operational: boolean;
  availability: "available" | "check";
  provider: "google-places" | "openstreetmap";
  rating?: number;
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
  priceLevel?: string;
};

type PhotonPlace = {
  place_id?: number;
  properties?: {
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

async function photonFallback(kind: "restaurant" | "stay", city: string, country: string, latitude: number, longitude: number) {
  const term = kind === "stay" ? "hotel" : "restaurant";
  const response = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q: term, lat: String(latitude), lon: String(longitude), limit: "8" })}`, {
    headers: { "User-Agent": "Journey local venue finder (portfolio prototype)" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return [];
  const data = await response.json() as { features?: PhotonPlace[] };
  const places: LocalPlace[] = [];
  for (const place of data.features ?? []) {
      const properties = place.properties ?? {};
      const [lon, lat] = place.geometry?.coordinates ?? [];
      const name = properties.name?.trim();
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const address = [properties.housenumber, properties.street, properties.locality || properties.city, properties.postcode, properties.country || country].filter(Boolean).join(", ") || `${city}, ${country}`;
      const searchQuery = `${name}, ${address}`;
      const china = /china/i.test(country);
      places.push({
        id: `photon-${properties.osm_id ?? `${lat}-${lon}`}`,
        name,
        address,
        category: properties.osm_value || properties.type || kind,
        coordinates: [lon, lat] as [number, number],
        mapsUrl: china
          ? `https://www.amap.com/search?query=${encodeURIComponent(searchQuery)}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`,
        distanceKm: distanceKm(latitude, longitude, lat!, lon!),
        operational: true as boolean,
        availability: "check" as "check",
        provider: "openstreetmap" as "openstreetmap",
      });
  }
  return places;
}

async function googleOperationalStays(country: string, latitude: number, longitude: number) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.googleMapsUri,places.rating,places.priceLevel",
    },
    body: JSON.stringify({
      includedTypes: ["lodging"],
      maxResultCount: 12,
      rankPreference: "DISTANCE",
      locationRestriction: { circle: { center: { latitude, longitude }, radius: 7000 } },
    }),
    next: { revalidate: 60 * 15 },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error("Google Places stay lookup unavailable");
  const seen = new Set<string>();
  return ((await response.json() as { places?: GooglePlace[] }).places ?? [])
    .flatMap((place) => {
      const name = place.displayName?.text?.trim();
      const lat = place.location?.latitude;
      const lon = place.location?.longitude;
      if (!name || !place.id || !Number.isFinite(lat) || !Number.isFinite(lon) || place.businessStatus !== "OPERATIONAL") return [];
      const key = `${name}|${place.formattedAddress ?? ""}`.toLocaleLowerCase();
      if (seen.has(key)) return [];
      seen.add(key);
      const searchQuery = `${name}, ${place.formattedAddress ?? country}`;
      return [{
        id: `google-${place.id}`,
        name,
        address: place.formattedAddress ?? country,
        category: "lodging",
        coordinates: [lon!, lat!] as [number, number],
        mapsUrl: place.googleMapsUri ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`,
        distanceKm: distanceKm(latitude, longitude, lat!, lon!),
        operational: true,
        availability: "check" as const,
        provider: "google-places" as const,
        rating: place.rating,
        priceLevel: place.priceLevel,
      } satisfies LocalPlace];
    });
}

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  const kind = request.nextUrl.searchParams.get("kind") === "stay" ? "stay" : "restaurant";
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lon"));
  if (!city || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ places: [] }, { status: 400 });
  }

  if (kind === "stay") {
    try {
      const places = await googleOperationalStays(country ?? "", latitude, longitude);
      if (places) return NextResponse.json({ places, source: "Google Places", inventory: false });
    } catch {
      // Keep the map-data fallback available, but never represent it as a live
      // availability result. The client labels these as "Check availability".
    }
  }

  const radius = kind === "stay" ? 7500 : 5000;
  const matcher = kind === "stay"
    ? '["tourism"~"^(hotel|hostel|guest_house|motel)$"]'
    : '["amenity"~"^(restaurant|cafe|fast_food)$"]';
  const query = `[out:json][timeout:18];nwr(around:${radius},${latitude},${longitude})${matcher}["name"];out center tags 35;`;

  try {
    // The Kumi mirror accepts a simple GET and has proved more reliable than the
    // main Overpass endpoint for browser-originated prototype requests.
    const response = await fetch(`https://overpass.kumi.systems/api/interpreter?${new URLSearchParams({ data: query })}`, {
      headers: { "User-Agent": "Journey local venue finder (portfolio prototype)" },
      next: { revalidate: 60 * 60 * 12 },
      // Overpass can be busy or unreachable. Never leave the finder in a
      // loading state while a serverless request waits for the upstream API.
      // This first-pass query is deliberately short. The interface should
      // gracefully fall back to Photon rather than leave someone waiting for
      // an overloaded Overpass mirror before they can choose a meal or stay.
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
        const name = tags.name?.trim();
        if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const address = addressFor(tags, country ? `${city}, ${country}` : city);
        const searchQuery = `${name}, ${address}`;
        const china = /china/i.test(country ?? "");
        places.push({
          id: `${place.id}`,
          name,
          address,
          category: tags.cuisine || tags.tourism || tags.amenity || kind,
          coordinates: [lon!, lat!] as [number, number],
          mapsUrl: china
            ? `https://www.amap.com/search?query=${encodeURIComponent(searchQuery)}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`,
          distanceKm: distanceKm(latitude, longitude, lat!, lon!),
          operational: true as boolean,
          availability: "check" as "check",
          provider: "openstreetmap" as "openstreetmap",
        });
    }
    const uniquePlaces = places
      .filter((place) => {
        const key = `${place.name}|${place.address}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
    return NextResponse.json({ places: uniquePlaces, source: "OpenStreetMap", inventory: false });
  } catch {
    // Overpass mirrors can be busy. Photon is a dependable OpenStreetMap-backed
    // fallback that still returns named, mapped venues.
    try {
      const places = await photonFallback(kind, city, country ?? "", latitude, longitude);
      return NextResponse.json({ places, source: "OpenStreetMap" });
    } catch {
      // Keep the response shape stable so the client can show its map fallback
      // and continue the meal/stay questions even when live lookup is offline.
      return NextResponse.json({ places: [], source: "OpenStreetMap", unavailable: true });
    }
  }
}
