import { NextResponse } from "next/server";
import { requireEasyTOwner } from "@/lib/easyt/owner";
import { getCountryMemories, getCountryStamps, setCountryMemory, setCountryStamp } from "@/lib/easyt/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const owner = await requireEasyTOwner();
    const [rows, memories] = await Promise.all([getCountryStamps(owner.id), getCountryMemories(owner.id)]);
    return NextResponse.json({
      statuses: Object.fromEntries(rows.map((row) => [row.countryId, row.status])),
      memories: Object.fromEntries(memories.map((memory) => [memory.countryId, { note: memory.note ?? "", photoData: memory.photoData ?? "" }])),
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
    if (!body.countryId || (body.note && body.note.length > 2000) || (body.photoData && body.photoData.length > 2_200_000)) return NextResponse.json({ error: "Invalid country memory." }, { status: 400 });
    await setCountryMemory({ ownerId: owner.id, countryId: body.countryId, note: body.note, photoData: body.photoData });
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
    if (!body.countryId || (body.status !== null && body.status !== "visited" && body.status !== "want")) {
      return NextResponse.json({ error: "Invalid country stamp." }, { status: 400 });
    }
    await setCountryStamp(owner.id, body.countryId, body.status as "visited" | "want" | null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save stamp.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
