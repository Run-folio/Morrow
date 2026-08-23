import { NextResponse } from "next/server";
import { requireEasyTOwner } from "@/lib/easyt/owner";
import { getCountryMemories, getCountryStamps, setCountryMemory, setCountryStamp } from "@/lib/easyt/repository";
import { normalizeStampCountryId, normalizeStampStatuses } from "@/lib/easyt/stamps";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const owner = await requireEasyTOwner();
    const [rows, memories] = await Promise.all([getCountryStamps(owner.id), getCountryMemories(owner.id)]);
    const statuses = normalizeStampStatuses(Object.fromEntries(rows.map((row) => [row.countryId, row.status])));
    const normalizedMemories = Object.fromEntries(memories.flatMap((memory) => {
      const countryId = normalizeStampCountryId(memory.countryId);
      return countryId ? [[countryId, { note: memory.note ?? "", photoData: memory.photoData ?? "" }]] : [];
    }));
    return NextResponse.json({
      statuses,
      memories: normalizedMemories,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load stamps.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
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
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
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
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
