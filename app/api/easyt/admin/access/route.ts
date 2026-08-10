import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { isEasyTAdmin } from "@/lib/easyt/owner";

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return NextResponse.json({ isAdmin: Boolean(session?.user?.email && isEasyTAdmin(session.user.email)) });
}
