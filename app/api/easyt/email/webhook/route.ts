import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { updateEasyTEmailEvent } from "@/lib/easyt/repository";

export const dynamic = "force-dynamic";

const statusMap: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

function verifyResendSignature(body: string, request: Request, secret: string) {
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signatures = request.headers.get("svix-signature")?.split(" ").filter(Boolean) ?? [];
  if (!id || !timestamp || !signatures.length) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;
  const encodedSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const key = Buffer.from(encodedSecret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return signatures.some((signature) => {
    const value = signature.replace(/^v\d+,/, "");
    const actual = Buffer.from(value);
    const wanted = Buffer.from(expected);
    return actual.length === wanted.length && timingSafeEqual(actual, wanted);
  });
}

export async function POST(request: Request) {
  const expected = process.env.RESEND_WEBHOOK_SECRET;
  const rawBody = await request.text();
  if (!expected || !verifyResendSignature(rawBody, request, expected)) {
    return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
  }
  const body = JSON.parse(rawBody) as { type?: string; created_at?: string; data?: { email_id?: string } };
  const providerId = body?.data?.email_id;
  const status = body?.type ? statusMap[body.type] : undefined;
  if (!providerId || !status) return NextResponse.json({ ok: true, ignored: true });
  await updateEasyTEmailEvent({ providerId, status, occurredAt: body?.created_at });
  return NextResponse.json({ ok: true });
}
