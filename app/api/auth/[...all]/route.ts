import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

function unavailable() {
  return Response.json({ error: "Morrovia authentication is temporarily unavailable." }, { status: 503 });
}

export async function GET(request: Request) {
  try {
    return await toNextJsHandler(getAuth()).GET(request);
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  try {
    return await toNextJsHandler(getAuth()).POST(request);
  } catch {
    return unavailable();
  }
}
