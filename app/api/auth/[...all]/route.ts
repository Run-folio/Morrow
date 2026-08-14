import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export async function GET(request: Request) {
  try {
    return toNextJsHandler(getAuth()).GET(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Morrovia authentication is unavailable.";
    return Response.json({ error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    return toNextJsHandler(getAuth()).POST(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Morrovia authentication is unavailable.";
    return Response.json({ error: message }, { status: 503 });
  }
}
