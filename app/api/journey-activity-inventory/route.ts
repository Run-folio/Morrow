import { NextResponse } from "next/server";
import { requireEasyTOwner } from "@/lib/easyt/owner";
import { ViatorAffiliateClient, ViatorAffiliateError } from "@/lib/easyt/viator-affiliate.server";

export const dynamic = "force-dynamic";

function optionalString(value: unknown, maximum: number) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : null;
}

export async function POST(request: Request) {
  try {
    await requireEasyTOwner();
    const body = await request.json() as { destination?: Record<string, unknown>; locale?: unknown; currency?: unknown };
    const canonicalPlaceId = typeof body.destination?.canonicalPlaceId === "string" ? body.destination.canonicalPlaceId.trim() : "";
    const name = typeof body.destination?.name === "string" ? body.destination.name.trim() : "";
    const country = optionalString(body.destination?.country, 80);
    const countryCode = optionalString(body.destination?.countryCode, 2);
    const region = optionalString(body.destination?.region, 120);
    const placeType = optionalString(body.destination?.placeType, 40);
    const aliases = body.destination?.aliases === undefined ? [] : Array.isArray(body.destination.aliases)
      ? body.destination.aliases.flatMap((alias) => typeof alias === "string" && alias.trim() && alias.trim().length <= 120 ? [alias.trim()] : []).slice(0, 16)
      : null;
    const rawCoordinates = body.destination?.coordinates;
    const coordinates = rawCoordinates && typeof rawCoordinates === "object"
      && typeof (rawCoordinates as { latitude?: unknown }).latitude === "number"
      && Number.isFinite((rawCoordinates as { latitude: number }).latitude)
      && Math.abs((rawCoordinates as { latitude: number }).latitude) <= 90
      && typeof (rawCoordinates as { longitude?: unknown }).longitude === "number"
      && Number.isFinite((rawCoordinates as { longitude: number }).longitude)
      && Math.abs((rawCoordinates as { longitude: number }).longitude) <= 180
      ? { latitude: (rawCoordinates as { latitude: number }).latitude, longitude: (rawCoordinates as { longitude: number }).longitude }
      : rawCoordinates === undefined ? undefined : null;
    if (!canonicalPlaceId || canonicalPlaceId.length > 160 || !name || name.length > 120 || !country || countryCode === null || region === null || placeType === null || aliases === null || coordinates === null) {
      return NextResponse.json({ activities: [] }, { status: 400 });
    }
    const activities = await new ViatorAffiliateClient().searchActivities({
      destination: {
        canonicalPlaceId,
        name,
        country,
        ...(countryCode && /^[A-Za-z]{2}$/.test(countryCode) ? { countryCode: countryCode.toUpperCase() } : {}),
        ...(region ? { region } : {}),
        ...(placeType ? { placeType } : {}),
        ...(coordinates ? { coordinates } : {}),
        ...(aliases.length ? { aliases } : {}),
      },
      count: 4,
      ...(typeof body.locale === "string" ? { locale: body.locale } : {}),
      ...(typeof body.currency === "string" ? { currency: body.currency } : {}),
    });
    return NextResponse.json({ activities: activities.map((activity) => ({
      ...activity,
      // Provider destination IDs remain an adapter concern; clients need only
      // Morrovia's canonical identity and Viator's truthful location label.
      destination: { canonicalPlaceId: activity.destination.canonicalPlaceId, label: activity.destination.label },
    })) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return NextResponse.json({ activities: [] }, { status: 401 });
    // Inventory enrichment is optional. Provider categories remain server-side
    // and the UI receives one calm, provider-neutral unavailable response.
    if (error instanceof ViatorAffiliateError) return NextResponse.json({ activities: [] }, { status: 503 });
    return NextResponse.json({ activities: [] }, { status: 503 });
  }
}
