import { NextRequest, NextResponse } from "next/server";

type BookingSearchResult = {
  id?: number | string;
  currency?: { accommodation?: string; booker?: string } | string;
  price?: { total?: number; display?: { accommodation_currency?: number; booker_currency?: number; value?: number }; base?: number };
  products?: Array<{ policies?: { cancellation?: { type?: string; free_cancellation_until?: string | null } } }>;
};

type BookingDetailsResult = {
  id?: number | string;
  name?: Record<string, string>;
  location?: { address?: Record<string, string>; coordinates?: { latitude?: number; longitude?: number } };
  rating?: { review_score?: number | null; stars?: number | null };
};

const apiBase = () => (process.env.BOOKING_DEMAND_API_BASE_URL || "https://demandapi.booking.com/3.2").replace(/\/$/, "");
const isIsoDate = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
const localized = (value?: Record<string, string>) => value?.["en-gb"] || value?.en || Object.values(value ?? {})[0];

function bookingHeaders() {
  return {
    Authorization: `Bearer ${process.env.BOOKING_DEMAND_API_KEY}`,
    "X-Affiliate-Id": process.env.BOOKING_DEMAND_AFFILIATE_ID ?? "",
    "Content-Type": "application/json",
  };
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.BOOKING_DEMAND_API_KEY;
  const affiliateId = process.env.BOOKING_DEMAND_AFFILIATE_ID;
  const params = request.nextUrl.searchParams;
  const latitude = Number(params.get("lat"));
  const longitude = Number(params.get("lon"));
  const checkIn = params.get("checkIn");
  const checkOut = params.get("checkOut");
  const adults = Math.min(30, Math.max(1, Number(params.get("adults")) || 1));
  const rooms = Math.min(adults, Math.max(1, Number(params.get("rooms")) || 1));
  const currency = (params.get("currency") || "USD").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "USD";
  const bookerCountry = (params.get("bookerCountry") || process.env.BOOKING_DEMAND_BOOKER_COUNTRY || "gb").toLowerCase();

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut! <= checkIn! || !/^[a-z]{2}$/.test(bookerCountry)) {
    return NextResponse.json({ properties: [], configured: Boolean(apiKey && affiliateId), error: "invalid_search" }, { status: 400 });
  }

  // Do not substitute ordinary map results here. A property is only returned
  // from this route after the partner confirms a matching product for the
  // requested dates and guest count.
  if (!apiKey || !affiliateId) return NextResponse.json({ properties: [], configured: false });

  try {
    const searchResponse = await fetch(`${apiBase()}/accommodations/search`, {
      method: "POST",
      headers: bookingHeaders(),
      body: JSON.stringify({
        booker: { country: bookerCountry, platform: "desktop" },
        checkin: checkIn,
        checkout: checkOut,
        coordinates: { latitude, longitude, radius: 7 },
        currency,
        guests: { number_of_adults: adults, number_of_rooms: rooms },
        extras: ["products", "extra_charges"],
        rows: 10,
        sort: { by: "distance", direction: "ascending" },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!searchResponse.ok) throw new Error(`Booking search failed (${searchResponse.status})`);
    const searchPayload = await searchResponse.json() as { data?: BookingSearchResult[] };
    const searchResults = (searchPayload.data ?? []).filter((result) => result.id !== undefined).slice(0, 10);
    if (!searchResults.length) return NextResponse.json({ properties: [], configured: true, source: "Booking.com Demand API" });

    const detailsResponse = await fetch(`${apiBase()}/accommodations/details`, {
      method: "POST",
      headers: bookingHeaders(),
      body: JSON.stringify({ accommodations: searchResults.map((result) => Number(result.id)), languages: ["en-gb"] }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!detailsResponse.ok) throw new Error(`Booking details failed (${detailsResponse.status})`);
    const detailsPayload = await detailsResponse.json() as { data?: BookingDetailsResult[] };
    const details = new Map((detailsPayload.data ?? []).map((detail) => [String(detail.id), detail]));

    const properties = searchResults.flatMap((result) => {
      const detail = details.get(String(result.id));
      const name = localized(detail?.name);
      const coordinates = detail?.location?.coordinates;
      const propertyLatitude = coordinates?.latitude;
      const propertyLongitude = coordinates?.longitude;
      if (!name || !Number.isFinite(propertyLatitude) || !Number.isFinite(propertyLongitude)) return [];
      const product = result.products?.[0];
      const displayPrice = result.price?.display?.booker_currency ?? result.price?.display?.accommodation_currency ?? result.price?.total ?? result.price?.base;
      const resultCurrency = typeof result.currency === "string" ? result.currency : result.currency?.booker || result.currency?.accommodation || currency;
      return [{
        id: `booking-${result.id}`,
        bookingAccommodationId: String(result.id),
        name,
        address: localized(detail?.location?.address) || "Address provided by accommodation search",
        category: "available stay",
        coordinates: [propertyLongitude!, propertyLatitude!] as [number, number],
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${localized(detail?.location?.address) || ""}`)}`,
        availability: "available" as const,
        provider: "booking-demand" as const,
        rating: detail?.rating?.review_score ?? undefined,
        price: Number.isFinite(displayPrice) ? { total: Number(displayPrice), currency: resultCurrency } : undefined,
        cancellation: product?.policies?.cancellation?.type,
      }];
    });
    return NextResponse.json({ properties, configured: true, source: "Booking.com Demand API" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    // Provider failures are deliberately indistinguishable from an empty live
    // inventory result to visitors. The client can retain safe map suggestions
    // without ever presenting them as partner-confirmed availability.
    return NextResponse.json({ properties: [], configured: true, unavailable: true });
  }
}
