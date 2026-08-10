import { NextResponse } from "next/server";
import { requireEasyTOwner } from "@/lib/easyt/owner";
import { getTripForOwner } from "@/lib/easyt/repository";
import { createTripPdf } from "@/lib/easyt/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ tripId: string }> }) {
  try {
    const owner = await requireEasyTOwner();
    const { tripId } = await context.params;
    const trip = await getTripForOwner(owner.id, tripId);
    if (!trip) return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    const safeName = trip.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "easyt-trip";
    return new NextResponse(Buffer.from(createTripPdf(trip)), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to export trip.";
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
