import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { recordEasyTAdminAuditEvent } from "@/lib/easyt/admin-content";
import { isEasyTAdmin } from "@/lib/easyt/owner";

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user?.email || !isEasyTAdmin(session.user.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || body.action !== "password_reset_requested" || typeof body.target !== "string" || body.target.length > 320) return NextResponse.json({ error: "Invalid audit event" }, { status: 400 });
  await recordEasyTAdminAuditEvent({ actorEmail: session.user.email, action: body.action, target: body.target.trim().toLowerCase() });
  return NextResponse.json({ ok: true });
}
