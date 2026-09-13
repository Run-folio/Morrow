import "server-only";

import { deliverMorroviaEmail } from "./email-delivery.ts";
import { finishEasyTEmailEvent, reserveEasyTEmailEvent } from "./repository.ts";

export * from "./email-template.ts";

import type { MorroviaEmail } from "./email-template.ts";

/** Send one policy-checked, idempotent transactional email through Resend. */
export async function sendMorroviaEmail(email: MorroviaEmail) {
  return deliverMorroviaEmail(email, {
    environment: process.env,
    fetcher: fetch,
    reserveDelivery: reserveEasyTEmailEvent,
    finishDelivery: finishEasyTEmailEvent,
  });
}
