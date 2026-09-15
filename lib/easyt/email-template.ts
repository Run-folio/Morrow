import { createHash } from "node:crypto";

export type MorroviaEmailTemplate =
  | "verification"
  | "password_reset"
  | "trip_gift"
  | "contact_internal";

export type MorroviaEmailContent = {
  subject: string;
  preheader: string;
  text: string;
  html: string;
  template: MorroviaEmailTemplate;
  idempotencyKey: string;
};

export type MorroviaEmail = MorroviaEmailContent & {
  to: string;
  replyTo?: string;
  recordEvent?: boolean;
};

type EmailBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "details"; rows: Array<{ label: string; value: string }> }
  | { kind: "quote"; text: string };

type EmailLayoutInput = {
  preheader: string;
  eyebrow: string;
  title: string;
  blocks: EmailBlock[];
  action?: { href: string; label: string };
  safetyNote?: string;
  supportUrl?: string;
};

const BRAND = {
  ink: "#17106f",
  inkSoft: "#4f4a92",
  action: "#3025ce",
  signal: "#d01866",
  paper: "#fbfaff",
  lilac: "#f2f0ff",
  line: "#d9d8ee",
  muted: "#6b6798",
} as const;

export const escapeEmailHtml = (value: string) => value.replace(
  /[&<>"']/g,
  (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character,
);

export function safeEmailActionUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Email action URL must be an absolute HTTP(S) URL.");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    throw new Error("Email action URL must be an absolute HTTP(S) URL.");
  }
  // Validate without reserializing so one-time auth links remain byte-for-byte
  // unchanged before email-safe HTML escaping.
  return value;
}

function emailIdempotencyKey(template: MorroviaEmailTemplate, stableIdentity: string) {
  const digest = createHash("sha256").update(stableIdentity).digest("hex");
  return `${template}/${digest}`;
}

const paragraphHtml = (text: string) =>
  `<p class="morrovia-body" style="margin:0 0 18px;color:${BRAND.inkSoft};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">${escapeEmailHtml(text)}</p>`;

function detailsHtml(rows: Array<{ label: string; value: string }>) {
  const rendered = rows.map((row) => `<tr>
    <td class="morrovia-detail-label" style="padding:7px 14px 7px 0;color:${BRAND.muted};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;vertical-align:top;white-space:nowrap">${escapeEmailHtml(row.label)}</td>
    <td class="morrovia-detail-value" style="padding:7px 0;color:${BRAND.ink};font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;vertical-align:top;word-break:break-word">${escapeEmailHtml(row.value)}</td>
  </tr>`).join("");
  return `<table role="presentation" class="morrovia-panel" width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 20px;border-collapse:separate;border-spacing:0;background:${BRAND.lilac};border:1px solid ${BRAND.line};border-radius:12px"><tr><td style="padding:14px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rendered}</table></td></tr></table>`;
}

function quoteHtml(text: string) {
  return `<table role="presentation" class="morrovia-panel" width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 20px;border-collapse:separate;border-spacing:0;background:${BRAND.lilac};border-left:4px solid ${BRAND.signal};border-radius:8px"><tr><td class="morrovia-body" style="padding:16px 18px;color:${BRAND.inkSoft};font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55">${escapeEmailHtml(text)}</td></tr></table>`;
}

function blockHtml(block: EmailBlock) {
  if (block.kind === "paragraph") return paragraphHtml(block.text);
  if (block.kind === "details") return detailsHtml(block.rows);
  return quoteHtml(block.text);
}

function blockText(block: EmailBlock) {
  if (block.kind === "paragraph") return block.text;
  if (block.kind === "quote") return `“${block.text}”`;
  return block.rows.map((row) => `${row.label}: ${row.value}`).join("\n");
}

export function renderMorroviaEmail(input: EmailLayoutInput) {
  const actionUrl = input.action ? safeEmailActionUrl(input.action.href) : null;
  const supportUrl = input.supportUrl ? safeEmailActionUrl(input.supportUrl) : null;
  const body = input.blocks.map(blockHtml).join("");
  const action = input.action && actionUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 8px"><tr><td style="border-radius:10px;background:${BRAND.action}"><a href="${escapeEmailHtml(actionUrl)}" style="display:inline-block;min-width:132px;padding:14px 20px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:1.2;text-align:center;text-decoration:none">${escapeEmailHtml(input.action.label)}</a></td></tr></table>`
    : "";
  const safetyNote = input.safetyNote
    ? `<p class="morrovia-footer" style="margin:28px 0 0;padding-top:18px;border-top:1px solid ${BRAND.line};color:${BRAND.muted};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55">${escapeEmailHtml(input.safetyNote)}</p>`
    : "";
  const support = supportUrl
    ? `<p class="morrovia-footer" style="margin:8px 0 0;color:${BRAND.muted};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.55">Need help? <a href="${escapeEmailHtml(supportUrl)}" style="color:${BRAND.ink};text-decoration:underline">Contact Morrovia</a>.</p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeEmailHtml(input.title)}</title>
  <style>
    @media only screen and (max-width:600px){.morrovia-shell{width:100%!important}.morrovia-card{padding:30px 22px!important}.morrovia-title{font-size:30px!important}}
    @media (prefers-color-scheme:dark){.morrovia-bg{background:#0d0a25!important}.morrovia-card{background:#17123b!important;border-color:#393268!important}.morrovia-title,.morrovia-brand,.morrovia-detail-value{color:#ffffff!important}.morrovia-body{color:#d8d5f2!important}.morrovia-detail-label,.morrovia-footer{color:#aaa6cc!important}.morrovia-panel{background:#211a4a!important;border-color:#4a427c!important}}
  </style>
</head>
<body class="morrovia-bg" style="margin:0;padding:0;background:${BRAND.lilac};color:${BRAND.ink};-webkit-text-size-adjust:100%;word-spacing:normal">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escapeEmailHtml(input.preheader)}&#847;&zwnj;&nbsp;&#8199;&#65279;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${BRAND.lilac}">
    <tr><td align="center" style="padding:28px 14px">
      <table role="presentation" class="morrovia-shell" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;border-collapse:separate;border-spacing:0">
        <tr><td class="morrovia-brand" style="padding:0 4px 18px;color:${BRAND.ink};font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;letter-spacing:-.02em">Morrovia</td></tr>
        <tr><td class="morrovia-card" style="padding:42px 40px;background:${BRAND.paper};border:1px solid ${BRAND.line};border-radius:16px">
          <p style="margin:0 0 14px;color:${BRAND.signal};font-family:'Courier New',Courier,monospace;font-size:11px;font-weight:700;line-height:1.3;letter-spacing:.12em;text-transform:uppercase">${escapeEmailHtml(input.eyebrow)}</p>
          <h1 class="morrovia-title" style="margin:0 0 22px;color:${BRAND.ink};font-family:Georgia,'Times New Roman',serif;font-size:36px;font-weight:700;line-height:1.12;letter-spacing:-.025em;overflow-wrap:anywhere;word-break:break-word">${escapeEmailHtml(input.title)}</h1>
          <div class="morrovia-copy">${body}${action}</div>
          ${safetyNote}${support}
        </td></tr>
        <tr><td class="morrovia-footer" style="padding:18px 4px 0;color:${BRAND.muted};font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5">Morrovia · Complex trips, made simple.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    "Morrovia",
    "",
    input.title,
    "",
    ...input.blocks.flatMap((block) => [blockText(block), ""]),
    ...(input.action && actionUrl ? [`${input.action.label}: ${actionUrl}`, ""] : []),
    ...(input.safetyNote ? [input.safetyNote, ""] : []),
    ...(supportUrl ? [`Contact Morrovia: ${supportUrl}`, ""] : []),
    "Morrovia · Complex trips, made simple.",
  ].join("\n").replace(/\n{3,}/g, "\n\n");

  return { html, text };
}

export function verificationEmail(url: string, supportUrl?: string): MorroviaEmailContent {
  const rendered = renderMorroviaEmail({
    preheader: "Confirm this address to keep your trips together.",
    eyebrow: "Your account",
    title: "Confirm your email",
    blocks: [{ kind: "paragraph", text: "Confirm this address to save your plans and open them securely on any device." }],
    action: { href: url, label: "Verify email" },
    safetyNote: "If you didn’t create a Morrovia account, you can ignore this email.",
    supportUrl,
  });
  return {
    subject: "Verify your email for Morrovia",
    preheader: "Confirm this address to keep your trips together.",
    template: "verification",
    idempotencyKey: emailIdempotencyKey("verification", url),
    ...rendered,
  };
}

export function passwordResetEmail(url: string, supportUrl?: string): MorroviaEmailContent {
  const rendered = renderMorroviaEmail({
    preheader: "Use this secure link to choose a new password.",
    eyebrow: "Account security",
    title: "Reset your password",
    blocks: [{ kind: "paragraph", text: "We received a request to reset the password for your Morrovia account." }],
    action: { href: url, label: "Reset password" },
    safetyNote: "If you didn’t request this, you can safely ignore this email.",
    supportUrl,
  });
  return {
    subject: "Reset your Morrovia password",
    preheader: "Use this secure link to choose a new password.",
    template: "password_reset",
    idempotencyKey: emailIdempotencyKey("password_reset", url),
    ...rendered,
  };
}

export function tripGiftEmail(input: {
  inviterName?: string | null;
  title: string;
  note?: string | null;
  url: string;
  supportUrl?: string;
  giftId: string;
}): MorroviaEmailContent {
  const inviter = input.inviterName?.trim();
  const rendered = renderMorroviaEmail({
    preheader: "Open your private Morrovia trip invitation.",
    eyebrow: "Trip invitation",
    title: inviter ? `${inviter} invited you to a trip` : "You’ve been invited to a trip",
    blocks: [
      { kind: "details", rows: [{ label: "Trip", value: input.title }] },
      ...(input.note ? [{ kind: "quote" as const, text: input.note }] : []),
      { kind: "paragraph", text: "Opening the invitation lets you claim your own editable copy. The original plan stays unchanged." },
    ],
    action: { href: input.url, label: "View trip" },
    safetyNote: "This private invitation expires after 14 days and only the invited email address can claim it.",
    supportUrl: input.supportUrl,
  });
  return {
    subject: "You’ve been invited to a trip",
    preheader: "Open your private Morrovia trip invitation.",
    template: "trip_gift",
    idempotencyKey: emailIdempotencyKey("trip_gift", input.giftId),
    ...rendered,
  };
}

export function contactSupportEmail(input: {
  recipient: string;
  name: string;
  replyEmail: string;
  topicLabel: string;
  message: string;
}): MorroviaEmailContent {
  const rendered = renderMorroviaEmail({
    preheader: `New ${input.topicLabel.toLowerCase()} from the Morrovia contact form.`,
    eyebrow: "Contact form",
    title: "New contact message",
    blocks: [
      { kind: "details", rows: [
        { label: "Contact type", value: input.topicLabel },
        { label: "Name", value: input.name },
        { label: "Reply email", value: input.replyEmail },
      ] },
      { kind: "quote", text: input.message },
    ],
    safetyNote: "Reply only after confirming the message is legitimate. Never request passwords, full passport details or payment-card information by email.",
  });
  return {
    subject: `Morrovia contact · ${input.topicLabel}`,
    preheader: `New ${input.topicLabel.toLowerCase()} from the Morrovia contact form.`,
    template: "contact_internal",
    idempotencyKey: emailIdempotencyKey("contact_internal", JSON.stringify(input)),
    ...rendered,
  };
}
