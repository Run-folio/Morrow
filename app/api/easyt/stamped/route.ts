import { NextResponse } from "next/server";
import { requireEasyTOwner } from "@/lib/easyt/owner";
import { getCountryMemories, getCountryStamps, setCountryMemory, setCountryStamp } from "@/lib/easyt/repository";
import { normalizeStampCountryId, normalizeStampStatuses } from "@/lib/easyt/stamps";

export const dynamic = "force-dynamic";

const diagnostic = (error: unknown) => {
  if (!error || typeof error !== "object") return { name: "UnknownError" };
  const candidate = error as { code?: unknown; name?: unknown };
  return {
    name: typeof candidate.name === "string" ? candidate.name : "Error",
    code: typeof candidate.code === "string" ? candidate.code : undefined,
  };
};

export async function GET() {
  try {
    const owner = await requireEasyTOwner();
    const rows = await getCountryStamps(owner.id);
    const statuses = normalizeStampStatuses(Object.fromEntries(rows.map((row) => [row.countryId, row.status])));
    let memories: Awaited<ReturnType<typeof getCountryMemories>> = [];
    let memoryWarning: "memories_unavailable" | undefined;
    try {
      memories = await getCountryMemories(owner.id);
    } catch (error) {
      memoryWarning = "memories_unavailable";
      console.error("[stamped] Secondary resource failed", {
        endpoint: "GET /api/easyt/stamped",
        resource: "memories",
        ...diagnostic(error),
      });
    }
    const normalizedMemories = Object.fromEntries(memories.flatMap((memory) => {
      const countryId = normalizeStampCountryId(memory.countryId);
      return countryId ? [[countryId, { note: memory.note ?? "", photoData: memory.photoData ?? "" }]] : [];
    }));
    return NextResponse.json({
      statuses,
      memories: normalizedMemories,
      warnings: memoryWarning ? [memoryWarning] : [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load stamps.";
    console.error("[stamped] Primary resource failed", {
      endpoint: "GET /api/easyt/stamped",
      resource: "statuses",
      ...diagnostic(error),
    });
    const unauthorized = message === "Unauthorized";
    return NextResponse.json({ error: unauthorized ? "Unauthorized" : "Unable to load stamps." }, { status: unauthorized ? 401 : 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const owner = await requireEasyTOwner();
    const body = (await request.json()) as { countryId?: string; note?: string; photoData?: string | null };
    const countryId = normalizeStampCountryId(body.countryId);
    if (!countryId || (body.note && body.note.length > 2000) || (body.photoData && body.photoData.length > 2_200_000)) return NextResponse.json({ error: "Invalid country memory." }, { status: 400 });
    await setCountryMemory({ ownerId: owner.id, countryId, note: body.note, photoData: body.photoData });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save country memory.";
    console.error("[stamped] Mutation failed", {
      endpoint: "PATCH /api/easyt/stamped",
      resource: "memories",
      ...diagnostic(error),
    });
    const unauthorized = message === "Unauthorized";
    return NextResponse.json({ error: unauthorized ? "Unauthorized" : "Unable to save country memory." }, { status: unauthorized ? 401 : 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const owner = await requireEasyTOwner();
    const body = (await request.json()) as { countryId?: string; status?: string | null };
    const countryId = normalizeStampCountryId(body.countryId);
    if (!countryId || (body.status !== null && body.status !== "visited" && body.status !== "want")) {
      return NextResponse.json({ error: "Invalid country stamp." }, { status: 400 });
    }
    await setCountryStamp(owner.id, countryId, body.status as "visited" | "want" | null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save stamp.";
    console.error("[stamped] Mutation failed", {
      endpoint: "PUT /api/easyt/stamped",
      resource: "statuses",
      ...diagnostic(error),
    });
    const unauthorized = message === "Unauthorized";
    return NextResponse.json({ error: unauthorized ? "Unauthorized" : "Unable to save stamp." }, { status: unauthorized ? 401 : 500 });
  }
}
