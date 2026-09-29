import { NextRequest, NextResponse } from "next/server";
import { requireEasyTOwner } from "@/lib/easyt/owner";
import { googlePlaceEnrichmentProvider } from "@/lib/easyt/google-place-enrichment.server";
import { placeEnrichmentEnabled, validPlaceEnrichmentQuery } from "@/lib/easyt/place-enrichment";
import { encodeGooglePhotoAttributions } from "@/lib/easyt/google-place-photo";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json({ unavailable: true }, { status: 503, headers: noStore });

export async function GET(request: NextRequest) {
  try { await requireEasyTOwner(); }
  catch { return NextResponse.json({ unavailable: true }, { status: 401, headers: noStore }); }
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !placeEnrichmentEnabled({ flag: process.env.MORROVIA_GOOGLE_PLACE_ENRICHMENT, key })) return unavailable();
  const mode = request.nextUrl.searchParams.get("mode");
  if (mode === "availability") return NextResponse.json({ enabled: true }, { headers: noStore });
  const provider = googlePlaceEnrichmentProvider(key);
  try {
    if (mode === "nearby") {
      const lat = request.nextUrl.searchParams.get("lat");
      const lon = request.nextUrl.searchParams.get("lon");
      if (lat === null || lon === null || !lat.trim() || !lon.trim()) return NextResponse.json({ error: "invalid_query" }, { status: 400, headers: noStore });
      const input = {
        latitude: Number(lat),
        longitude: Number(lon),
        category: request.nextUrl.searchParams.get("category") ?? "",
      };
      if (!validPlaceEnrichmentQuery(input)) return NextResponse.json({ error: "invalid_query" }, { status: 400, headers: noStore });
      return NextResponse.json({ places: await provider.nearby(input) }, { headers: noStore });
    }
    if (mode === "details") {
      const id = request.nextUrl.searchParams.get("id") ?? "";
      if (!/^[a-zA-Z0-9_-]{1,180}$/.test(id)) return NextResponse.json({ error: "invalid_place" }, { status: 400, headers: noStore });
      const place = await provider.details(id);
      return place ? NextResponse.json({ place }, { headers: noStore }) : unavailable();
    }
    if (mode === "reviews" || mode === "photo") {
      const id = request.nextUrl.searchParams.get("id") ?? "";
      if (!/^[a-zA-Z0-9_-]{1,180}$/.test(id)) return NextResponse.json({ error: "invalid_place" }, { status: 400, headers: noStore });
      if (mode === "reviews") return NextResponse.json({ reviews: await provider.reviews(id) }, { headers: noStore });
      const photo = await provider.photo(id);
      return photo ? new NextResponse(photo.body, { headers: {
        ...noStore,
        "Content-Type": photo.contentType,
        "X-Content-Type-Options": "nosniff",
        "X-Morrovia-Photo-Source": photo.sourceUrl,
        ...(photo.attributions.length ? { "X-Morrovia-Photo-Attribution": encodeGooglePhotoAttributions(photo.attributions) } : {}),
      } }) : unavailable();
    }
    return NextResponse.json({ error: "invalid_mode" }, { status: 400, headers: noStore });
  } catch {
    return unavailable();
  }
}
