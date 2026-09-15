import { NextResponse } from "next/server";

import { getEasyTDatabase } from "@/lib/easyt/database";
import { checkRuntimeHealth } from "@/lib/easyt/runtime-health";

export const dynamic = "force-dynamic";

/** Critical, unauthenticated uptime probe. The response exposes states only. */
export async function GET() {
  const health = await checkRuntimeHealth(
    {
      ...process.env,
      // Direct references let Next embed safe Netlify build metadata for the
      // server route even when COMMIT_REF/CONTEXT are absent at function runtime.
      MORROVIA_BUILD_COMMIT: process.env.MORROVIA_BUILD_COMMIT,
      MORROVIA_BUILD_CONTEXT: process.env.MORROVIA_BUILD_CONTEXT,
    },
    async () => {
      const sql = getEasyTDatabase();
      await sql`select 1 as ok`;
    },
  );
  return NextResponse.json(health, {
    status: health.state === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
