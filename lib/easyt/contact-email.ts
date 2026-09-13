import { contactTopicLabel, type ContactMessageInput } from "./contact-message.ts";
import { contactSupportEmail } from "./email-template.ts";

export function contactEmail(input: ContactMessageInput, recipient: string) {
  return contactSupportEmail({
    recipient,
    name: input.name,
    replyEmail: input.email,
    topicLabel: contactTopicLabel(input.topic),
    message: input.message,
  });
}

export function contactDelivery(input: ContactMessageInput, recipient: string) {
  return {
    to: recipient,
    replyTo: input.email,
    recordEvent: false as const,
    ...contactEmail(input, recipient),
  };
}
