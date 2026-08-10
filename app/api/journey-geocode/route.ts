import { NextRequest, NextResponse } from "next/server";

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
  type?: string;
  category?: string;
  addresstype?: string;
  address?: { country?: string };
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

async function find(query: string, country?: string) {
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
  const result = results
    .filter((candidate) => !country || matchesCountry(candidate.address?.country, country))
    .map((candidate) => {
      const name = normalise(candidate.name ?? candidate.display_name ?? "");
      const kind = candidate.addresstype ?? candidate.type ?? candidate.category ?? "";
      const nameMatch = name === requested ? 50 : name.includes(requested) ? 24 : 0;
      const placeKind = /city|town|village|suburb|neighbourhood|county|state|island|peak|park|attraction|museum|historic/.test(kind) ? 12 : 0;
      return { candidate, score: nameMatch + placeKind };
    })
    .sort((a, b) => b.score - a.score)[0]?.candidate;
  const latitude = Number(result?.lat);
  const longitude = Number(result?.lon);
  const isCountry = result.type === "country" || result.addresstype === "country";
  if (!result || isCountry || !Number.isFinite(latitude) || !Number.isFinite(longitude) || (country && !matchesCountry(result.address?.country, country))) return null;
  const friendlyName = !country && result.name && normalise(result.name).includes(normalise(query)) ? query : result.name ?? result.display_name;
  return {
    coordinates: [longitude, latitude] as [number, number],
    name: friendlyName,
    country: result.address?.country,
    kind: result.addresstype ?? result.type ?? result.category ?? "place",
  };
}

export async function GET(request: NextRequest) {
  const place = request.nextUrl.searchParams.get("place")?.trim();
  const country = request.nextUrl.searchParams.get("country")?.trim();
  if (!place || place.length > 140 || (country && country.length > 100)) return NextResponse.json({ result: null }, { status: 400 });

  try {
    // This endpoint validates an actual city, region or attraction. It no longer
    // falls back to a country centroid: a user should never believe they added a
    // real stop when the result is only a broad country match.
    const exact = await find(country ? `${place}, ${country}` : place, country ?? undefined);
    return NextResponse.json({ result: exact });
  } catch {
    return NextResponse.json({ result: null });
  }
}
