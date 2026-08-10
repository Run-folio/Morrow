import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { recordEasyTAdminAuditEvent } from "@/lib/easyt/admin-content";
import { isEasyTAdmin } from "@/lib/easyt/owner";
import { easyTFeedbackStatuses, updateEasyTFeedbackTriage } from "@/lib/easyt/repository";

export async function PATCH(request: Request, { params }: { params: Promise<{ feedbackId: string }> }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user?.email || !isEasyTAdmin(session.user.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { feedbackId } = await params;
  const body = await request.json().catch(() => null);
  const status = body?.status;
  const internalNote = typeof body?.internalNote === "string" ? body.internalNote.slice(0, 2000) : null;
  if (!easyTFeedbackStatuses.includes(status) || internalNote === null) return NextResponse.json({ error: "Invalid triage update." }, { status: 400 });
  const updated = await updateEasyTFeedbackTriage({ feedbackId, status, internalNote, triagedBy: session.user.email });
  if (!updated) return NextResponse.json({ error: "Feedback item not found." }, { status: 404 });
  await recordEasyTAdminAuditEvent({ actorEmail: session.user.email, action: "feedback_triaged", target: `feedback:${feedbackId}`, detail: { status } });
  return NextResponse.json({ ok: true });
}
