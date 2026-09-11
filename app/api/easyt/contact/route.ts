import { NextRequest, NextResponse } from "next/server";
import { contactDelivery, parseContactMessage } from "@/lib/easyt/contact-message";
import { contactRateLimitAllows } from "@/lib/easyt/contact-rate-limit.server";
import { sendEasyTEmail } from "@/lib/easyt/email";

const MAX_REQUEST_BYTES = 12_000;

function requesterKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Send the contact form as JSON." }, { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "That message is too large." }, { status: 413 });
  }
  if (!contactRateLimitAllows(requesterKey(request))) {
    return NextResponse.json({ error: "Too many messages were sent. Please wait and try again." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The contact form could not be read." }, { status: 400 });
  }
  const parsed = parseContactMessage(body);
  if (parsed.spam) return NextResponse.json({ error: "The message could not be sent." }, { status: 400 });
  if (Object.keys(parsed.errors).length) return NextResponse.json({ errors: parsed.errors }, { status: 400 });

  const recipient = process.env.CONTACT_TO_EMAIL;
  if (!recipient) {
    console.error("Contact delivery is not configured: CONTACT_TO_EMAIL is missing.");
    return NextResponse.json({ error: "Contact is temporarily unavailable. Please try again later." }, { status: 503 });
  }
  try {
    await sendEasyTEmail(contactDelivery(parsed.input, recipient));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Contact delivery failed.", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Your message could not be sent. Please try again." }, { status: 502 });
  }
}
