import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { isEasyTAdmin } from "@/lib/easyt/owner";
import { routeFamilyByKey } from "@/lib/easyt/route-catalog";
import { updateEasyTRouteControl } from "@/lib/easyt/admin-content";

export async function PATCH(request: Request, { params }: { params: Promise<{ routeKey: string }> }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user?.email || !isEasyTAdmin(session.user.email)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { routeKey } = await params;
  if (!routeFamilyByKey[routeKey]) return NextResponse.json({ error: "Unknown route" }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.published !== "boolean" || typeof body.featured !== "boolean") return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const control = await updateEasyTRouteControl({ routeKey, published: body.published, featured: body.featured, updatedBy: session.user.email });
  return NextResponse.json(control);
}
