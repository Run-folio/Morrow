import { NextRequest, NextResponse } from "next/server";
import { parseTripBrief } from "@/lib/easyt/trip-brief";

export const runtime = "nodejs";
export const maxDuration = 60;

type GeocodeResult = { name?: string; country?: string; coordinates?: [number, number]; kind?: string; locality?: string };
type MentionRole = "origin" | "stop";
type PlaceIntent = "place" | "landmark";
type CapturedMention = {
  sourceText: string;
  canonicalName: string;
  role: MentionRole;
  order: number;
  status: "resolved" | "unresolved";
  country?: string;
  coordinates?: [number, number];
  kind?: string;
  intent: PlaceIntent;
  locality?: string;
};
type ExtractedMention = { sourceText: string; canonicalName: string; role: MentionRole; intent: PlaceIntent; order: number };
type ExtractedCapture = { mentions: ExtractedMention[]; regions: string[]; durationDays?: number; routeHints: string[] };

// A small canonical-country guard stops ambiguous city names being silently
// accepted in the wrong country (for example London, Ontario for London, UK).
// Unknown names remain open to the general geocoder and the traveller review.
const knownCountries: Record<string, string> = {
  London: "United Kingdom", Tokyo: "Japan", Kyoto: "Japan", Osaka: "Japan", Kanazawa: "Japan", Takayama: "Japan", Hiroshima: "Japan",
  "Machu Picchu": "Peru", Cusco: "Peru", Lima: "Peru", Bogotá: "Colombia", Medellín: "Colombia", Quito: "Ecuador", "La Paz": "Bolivia",
  Bangkok: "Thailand", "Chiang Mai": "Thailand", Krabi: "Thailand", "Angkor Wat": "Cambodia", "Siem Reap": "Cambodia", Hanoi: "Vietnam", "Hoi An": "Vietnam", "Ho Chi Minh City": "Vietnam", "Luang Prabang": "Laos", "Vang Vieng": "Laos",
  Paris: "France", Rome: "Italy", Venice: "Italy", Milan: "Italy", Barcelona: "Spain", Madrid: "Spain", Lisbon: "Portugal", Porto: "Portugal",
};

const captureSchema = {
  type: "object",
  additionalProperties: false,
  required: ["mentions", "regions", "durationDays", "routeHints"],
  properties: {
    mentions: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceText", "canonicalName", "role", "intent", "order"],
        properties: {
          sourceText: { type: "string" },
          canonicalName: { type: "string" },
          role: { type: "string", enum: ["origin", "stop"] },
          intent: { type: "string", enum: ["place", "landmark"] },
          order: { type: "integer", minimum: 0, maximum: 20 },
        },
      },
    },
    regions: { type: "array", maxItems: 6, items: { type: "string" } },
    durationDays: { type: ["integer", "null"], minimum: 1, maximum: 365 },
    routeHints: { type: "array", maxItems: 8, items: { type: "string" } },
  },
} as const;

const extractionPolicy = `You extract a traveller's location intent for Morrovia. Return every explicitly requested departure point and destination, landmark or region in the order the traveller mentions it. Correct obvious spelling mistakes only in canonicalName, but preserve the exact original phrase in sourceText. Never invent a location, route, country, date or stop. A region belongs in regions, not mentions. A landmark, heritage site, monument, national park, museum, natural wonder or major attraction is a stop with intent landmark, never its nearest city. Cities, towns and airports have intent place. Return durationDays when the text gives a duration; otherwise null.`;

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function resolve(request: NextRequest, place: string, country?: string) {
  const url = new URL("/api/journey-geocode", request.url);
  url.searchParams.set("place", place);
  if (country) url.searchParams.set("country", country);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  const body = await response.json() as { result?: GeocodeResult | null };
  return body.result ?? null;
}

function cleanExtraction(value: unknown): ExtractedCapture | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { mentions?: unknown; regions?: unknown; durationDays?: unknown; routeHints?: unknown };
  const mentions = Array.isArray(raw.mentions) ? raw.mentions.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const mention = item as Partial<ExtractedMention>;
    if (typeof mention.sourceText !== "string" || typeof mention.canonicalName !== "string" || (mention.role !== "origin" && mention.role !== "stop") || (mention.intent !== "place" && mention.intent !== "landmark") || !Number.isInteger(mention.order)) return [];
    const sourceText = mention.sourceText.trim().slice(0, 140);
    const canonicalName = mention.canonicalName.trim().slice(0, 140);
    return sourceText && canonicalName ? [{ sourceText, canonicalName, role: mention.role, intent: mention.intent, order: mention.order as number }] : [];
  }) : [];
  const strings = (value: unknown, maximum: number) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 120)).filter(Boolean).slice(0, maximum) : [];
  const durationDays = typeof raw.durationDays === "number" && Number.isInteger(raw.durationDays) && raw.durationDays > 0 && raw.durationDays <= 365 ? raw.durationDays : undefined;
  return { mentions, regions: strings(raw.regions, 6), durationDays, routeHints: strings(raw.routeHints, 8) };
}

async function extractWithModel(brief: string): Promise<ExtractedCapture | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        temperature: 0,
        max_completion_tokens: 900,
        messages: [{ role: "system", content: extractionPolicy }, { role: "user", content: brief }],
        response_format: { type: "json_schema", json_schema: { name: "morrovia_trip_capture", strict: true, schema: captureSchema } },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const content = payload.choices?.[0]?.message?.content;
    return content ? cleanExtraction(JSON.parse(content)) : null;
  } catch { return null; }
}

function reconcile(brief: string, model: ExtractedCapture | null) {
  const fallback = parseTripBrief(brief);
  const deterministic: ExtractedMention[] = [
    ...(fallback.origin ? [{ sourceText: fallback.origin, canonicalName: fallback.origin, role: "origin" as const, intent: "place" as const, order: -1 }] : []),
    ...fallback.stops.filter((name) => name !== fallback.origin).map((name, order) => ({ sourceText: name, canonicalName: name, role: "stop" as const, intent: name === fallback.anchor ? "landmark" as const : "place" as const, order })),
  ];
  const combined = [...(model?.mentions ?? []), ...deterministic]
    .sort((a, b) => a.order - b.order)
    .filter((mention, index, all) => all.findIndex((other) => other.canonicalName.toLocaleLowerCase() === mention.canonicalName.toLocaleLowerCase() && other.role === mention.role) === index);
  const origin = combined.find((mention) => mention.role === "origin");
  const mentions = combined.filter((mention) => mention.role !== "origin").map((mention, order) => ({ ...mention, order }));
  return {
    mentions: [...(origin ? [{ ...origin, order: 0 }] : []), ...mentions],
    regions: [...new Set([...(model?.regions ?? []), ...fallback.regions])],
    routeHints: [...new Set([...(model?.routeHints ?? []), ...fallback.routeHints])],
    durationDays: model?.durationDays ?? fallback.durationDays,
    parserVersion: model ? "capture-v2-model+deterministic" : "capture-v2-deterministic",
  };
}

export async function POST(request: NextRequest) {
  let body: { brief?: unknown };
  try { body = await request.json() as { brief?: unknown }; } catch { return NextResponse.json({ message: "Invalid trip brief." }, { status: 400 }); }
  const brief = typeof body.brief === "string" ? body.brief.trim().slice(0, 600) : "";
  if (!brief) return NextResponse.json({ message: "Add a trip brief first." }, { status: 400 });

  const extracted = reconcile(brief, await extractWithModel(brief));
  const candidates = extracted.mentions.map((mention) => ({ name: mention.canonicalName, sourceText: mention.sourceText, role: mention.role, intent: mention.intent, country: knownCountries[mention.canonicalName] }));

  const mentions: CapturedMention[] = [];
  // Public Nominatim permits at most one request per second. Resolving in order
  // also means a later place can never disappear because a parallel request was
  // throttled. Replace this adapter with a production geocoder as traffic grows.
  for (const [order, candidate] of candidates.entries()) {
    if (order) await pause(1_050);
    const result = await resolve(request, candidate.name, candidate.country).catch(() => null);
    mentions.push({
      sourceText: candidate.sourceText,
      canonicalName: result?.name?.split(",")[0]?.trim() || candidate.name,
      role: candidate.role,
      order,
      status: result?.coordinates && result.country ? "resolved" : "unresolved",
      country: result?.country,
      coordinates: result?.coordinates,
      kind: result?.kind,
      intent: candidate.intent,
      locality: result?.locality,
    });
  }

  return NextResponse.json({
    rawBrief: brief,
    parserVersion: extracted.parserVersion,
    durationDays: extracted.durationDays,
    regions: extracted.regions,
    routeHints: extracted.routeHints,
    mentions,
  });
}
