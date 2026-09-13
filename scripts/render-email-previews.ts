import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  contactSupportEmail,
  passwordResetEmail,
  tripGiftEmail,
  verificationEmail,
  type MorroviaEmailContent,
} from "../lib/easyt/email-template.ts";

const origin = "https://preview.morrovia.test";
const supportUrl = `${origin}/journey/contact?topic=support`;
const fixtures: Array<{ name: string; email: MorroviaEmailContent }> = [
  {
    name: "account-verification",
    email: verificationEmail(`${origin}/api/auth/verify-email?token=preview-token`, supportUrl),
  },
  {
    name: "password-reset",
    email: passwordResetEmail(`${origin}/journey/reset-password?token=preview-token`, supportUrl),
  },
  {
    name: "trip-invitation",
    email: tripGiftEmail({
      giftId: "preview-gift-standard",
      inviterName: "Maya",
      title: "Lisbon to the Alentejo",
      note: "I saved the slower route so we have time for Évora.",
      url: `${origin}/journey/gift/preview-token`,
      supportUrl,
    }),
  },
  {
    name: "trip-invitation-long-unicode",
    email: tripGiftEmail({
      giftId: "preview-gift-long",
      inviterName: "長い名前の旅行者",
      title: "東京、金沢、高山、京都、大阪をゆっくり巡る、とても長い旅の計画",
      url: `${origin}/journey/gift/preview-token-long`,
      supportUrl,
    }),
  },
  {
    name: "contact-internal",
    email: contactSupportEmail({
      recipient: "support@morrovia.test",
      name: "Alex Traveller",
      replyEmail: "alex@example.test",
      topicLabel: "Support request",
      message: "I need help understanding a connection in my route.",
    }),
  },
];

const outputDirectory = resolve(process.cwd(), ".email-previews");
mkdirSync(outputDirectory, { recursive: true });
for (const fixture of fixtures) {
  writeFileSync(resolve(outputDirectory, `${fixture.name}.html`), fixture.email.html, "utf8");
  writeFileSync(resolve(outputDirectory, `${fixture.name}.txt`), fixture.email.text, "utf8");
}

const links = fixtures.map((fixture) => `<li><a href="./${fixture.name}.html">${fixture.name}</a> · <a href="./${fixture.name}.txt">plain text</a></li>`).join("\n");
writeFileSync(resolve(outputDirectory, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Morrovia email previews</title><body><h1>Morrovia email previews</h1><ul>${links}</ul></body></html>`, "utf8");

console.log(`Rendered ${fixtures.length} deterministic email previews to ${outputDirectory}`);
