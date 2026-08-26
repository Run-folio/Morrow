import { NextResponse } from "next/server";

import { getEasyTDatabase } from "@/lib/easyt/database";
import { checkRuntimeHealth } from "@/lib/easyt/runtime-health";

export const dynamic = "force-dynamic";

/** Critical, unauthenticated uptime probe. The response exposes states only. */
export async function GET() {
  const health = await checkRuntimeHealth(process.env, async () => {
    const sql = getEasyTDatabase();
    await sql`select 1 as ok`;
  });
  return NextResponse.json(health, {
    status: health.state === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
