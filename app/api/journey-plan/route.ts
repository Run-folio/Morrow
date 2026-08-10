import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Destination = { id?: string; name?: string };
type Brief = {
  origin?: string;
  destinations?: Destination[];
  startDate?: string;
  endDate?: string;
  duration?: string;
  travellers?: string;
  anchor?: string;
  interests?: string[];
  constraints?: string[];
  picks?: Record<string, string[]>;
};

const routeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["recommendation", "routeOptions"],
  properties: {
    recommendation: {
      type: "object",
      additionalProperties: false,
      required: ["title", "summary"],
      properties: {
        title: { type: "string" },
        summary: { type: "string" },
      },
    },
    routeOptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "route"],
        properties: {
          label: { type: "string" },
          route: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

function cleanBrief(value: unknown): Brief | null {
  if (!value || typeof value !== "object") return null;
  const brief = value as Brief;
  const destinations = Array.isArray(brief.destinations)
    ? brief.destinations
      .filter((destination) => destination && typeof destination.name === "string")
      .map((destination) => ({ id: destination.id?.slice(0, 100), name: destination.name?.trim().slice(0, 100) }))
      .filter((destination) => destination.name)
      .slice(0, 8)
    : [];
  if (!destinations.length) return null;
  const strings = (items: unknown, max = 12) => Array.isArray(items)
    ? items.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 180)).slice(0, max)
    : [];
  const picks = Object.fromEntries(Object.entries(brief.picks ?? {}).slice(0, 8).map(([key, values]) => [key.slice(0, 100), strings(values, 10)]));
  return {
    origin: typeof brief.origin === "string" ? brief.origin.slice(0, 100) : "",
    destinations,
    startDate: typeof brief.startDate === "string" ? brief.startDate.slice(0, 20) : "",
    endDate: typeof brief.endDate === "string" ? brief.endDate.slice(0, 20) : "",
    duration: typeof brief.duration === "string" ? brief.duration.slice(0, 10) : "",
    travellers: typeof brief.travellers === "string" ? brief.travellers.slice(0, 100) : "",
    anchor: typeof brief.anchor === "string" ? brief.anchor.slice(0, 240) : "",
    interests: strings(brief.interests),
    constraints: strings(brief.constraints),
    picks,
  };
}

const plannerPolicy = `You are Journey's senior travel planner. Turn a traveller's short brief into a useful decision review, not a generic destination list.

Assess route order, transfer friction, attraction access, seasonal conditions and booking pressure from the traveller brief and your general knowledge. Do not invent exact departure times, prices, restaurant availability or current availability. Flag facts that need live verification in researchNext. Do not provide visa, medical, safety or legal advice.

Challenge the proposed itinerary where appropriate. Specifically assess whether the number of places fits the time, whether a detour earns its transfer time, which anchors deserve more than a day, and which places should be saved for a future trip. Keep the answer concise, constructive and specific. The JSON needs to be a decision aid that the UI can render directly.`;

function textList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 5) : [];
}

function normalizePlan(value: unknown) {
  const raw = value as { recommendation?: Record<string, unknown>; routeOptions?: Record<string, unknown>[]; challenges?: unknown; researchNext?: unknown };
  return {
    recommendation: {
      title: typeof raw.recommendation?.title === "string" ? raw.recommendation.title : "A route worth protecting",
      summary: typeof raw.recommendation?.summary === "string" ? raw.recommendation.summary : "Journey has shaped the route around the strongest anchors.",
      why: textList(raw.recommendation?.why).length ? textList(raw.recommendation?.why) : ["Protect the selected anchors rather than treating every place as a separate stop.", "Leave space around transfers, arrival days and a meal-led local rhythm."],
    },
    routeOptions: (raw.routeOptions ?? []).slice(0, 3).map((option) => ({
      label: typeof option.label === "string" ? option.label : "Route option",
      route: textList(option.route),
      verdict: typeof option.verdict === "string" ? option.verdict : "A viable way to structure the trip.",
      tradeoff: typeof option.tradeoff === "string" ? option.tradeoff : "Confirm transport and availability before booking.",
    })),
    challenges: textList(raw.challenges).length ? textList(raw.challenges) : ["Confirm that the selected places can be connected without turning the trip into a chain of transfers."],
    researchNext: textList(raw.researchNext).length ? textList(raw.researchNext) : ["Inter-city transport and realistic transfer time", "Attraction capacity, opening windows and booking lead time", "The best accommodation base for each chapter"],
  };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      code: "CONFIGURATION_REQUIRED",
      message: "Add GROQ_API_KEY to .env.local to enable free-tier Journey research.",
    }, { status: 503 });
  }

  let body: { brief?: unknown; selectedRouteId?: unknown };
  try {
    body = await request.json() as { brief?: unknown; selectedRouteId?: unknown };
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }
  const brief = cleanBrief(body.brief);
  if (!brief) return NextResponse.json({ message: "Add at least one destination before researching a route." }, { status: 400 });

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        max_completion_tokens: 1200,
        temperature: 0.2,
        messages: [
          { role: "system", content: plannerPolicy },
          { role: "user", content: `Review this trip brief. The visitor selected the ${typeof body.selectedRouteId === "string" ? body.selectedRouteId : "balanced"} planning direction.\n\n${JSON.stringify(brief)}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "journey_route_review", strict: true, schema: routeSchema } },
      }),
      signal: AbortSignal.timeout(55_000),
    });
    const payload = await response.json() as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message || "Groq request failed.");
    const output = payload.choices?.[0]?.message?.content;
    if (!output) throw new Error("The planner did not return a structured response.");
    return NextResponse.json({ plan: normalizePlan(JSON.parse(output)), researchedAt: new Date().toISOString(), provider: "groq" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live research failed.";
    return NextResponse.json({ message }, { status: 502 });
  }
}
