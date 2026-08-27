import { handleTripCopilotApplyRequest } from "@/lib/easyt/trip-copilot-apply-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, context: { params: Promise<{ tripId: string }> }) {
  return handleTripCopilotApplyRequest(request, context, "change_transport_preference");
}
