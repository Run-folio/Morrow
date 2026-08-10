import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { deleteEasyTUser } from "@/lib/easyt/admin-content";
import { isEasyTAdmin } from "@/lib/easyt/owner";

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user?.email || !isEasyTAdmin(session.user.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const confirmation = typeof body?.confirmation === "string" ? body.confirmation.trim().toLowerCase() : "";
  if (!email || email.length > 320 || confirmation !== email) return NextResponse.json({ error: "Type the exact account email to confirm deletion." }, { status: 400 });
  if (email === session.user.email.toLowerCase() || isEasyTAdmin(email)) return NextResponse.json({ error: "Superuser accounts cannot be deleted here." }, { status: 400 });
  const deleted = await deleteEasyTUser({ email, actorEmail: session.user.email });
  if (!deleted) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
