export const CONTACT_NAME_MIN_LENGTH = 2;
export const CONTACT_NAME_MAX_LENGTH = 100;
export const CONTACT_EMAIL_MAX_LENGTH = 254;
export const CONTACT_MESSAGE_MIN_LENGTH = 20;
export const CONTACT_MESSAGE_MAX_LENGTH = 4_000;

export type ContactTopic = "general" | "support" | "privacy" | "complaint";
export type ContactMessageInput = {
  name: string;
  email: string;
  message: string;
  topic: ContactTopic;
  website: string;
};
export type ContactFieldErrors = Partial<Record<"name" | "email" | "message", string>>;

const topicLabels: Record<ContactTopic, string> = {
  general: "General enquiry",
  support: "Support request",
  privacy: "Privacy request",
  complaint: "Complaint",
};

const removeUnsafeControls = (value: string) => value
  .replace(/\r\n?/g, "\n")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const cleanSingleLine = (value: unknown) => removeUnsafeControls(typeof value === "string" ? value : "")
  .replace(/\s+/g, " ")
  .trim();

const cleanMessage = (value: unknown) => removeUnsafeControls(typeof value === "string" ? value : "")
  .split("\n")
  .map((line) => line.replace(/[\t ]+/g, " ").trimEnd())
  .join("\n")
  .trim();

export function contactTopic(value: unknown): ContactTopic {
  return value === "support" || value === "privacy" || value === "complaint" ? value : "general";
}

export function parseContactMessage(value: unknown): { input: ContactMessageInput; errors: ContactFieldErrors; spam: boolean } {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const input: ContactMessageInput = {
    name: cleanSingleLine(body.name).slice(0, CONTACT_NAME_MAX_LENGTH + 1),
    email: cleanSingleLine(body.email).toLowerCase().slice(0, CONTACT_EMAIL_MAX_LENGTH + 1),
    message: cleanMessage(body.message).slice(0, CONTACT_MESSAGE_MAX_LENGTH + 1),
    topic: contactTopic(body.topic),
    website: cleanSingleLine(body.website).slice(0, 200),
  };
  const errors: ContactFieldErrors = {};
  if (input.name.length < CONTACT_NAME_MIN_LENGTH) errors.name = "Enter your name using at least 2 characters.";
  else if (input.name.length > CONTACT_NAME_MAX_LENGTH) errors.name = "Keep your name to 100 characters or fewer.";
  if (!input.email) errors.email = "Enter your email address.";
  else if (input.email.length > CONTACT_EMAIL_MAX_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) errors.email = "Enter a valid email address.";
  if (input.message.length < CONTACT_MESSAGE_MIN_LENGTH) errors.message = "Tell us a little more using at least 20 characters.";
  else if (input.message.length > CONTACT_MESSAGE_MAX_LENGTH) errors.message = "Keep your message to 4,000 characters or fewer.";
  return { input, errors, spam: Boolean(input.website) };
}

export function contactEmail(input: ContactMessageInput) {
  return {
    subject: `Morrovia contact: ${topicLabels[input.topic]}`,
    text: [
      `Contact type: ${topicLabels[input.topic]}`,
      `Name: ${input.name}`,
      `Reply email: ${input.email}`,
      "",
      input.message,
    ].join("\n"),
  };
}

export function contactDelivery(input: ContactMessageInput, recipient: string) {
  return {
    to: recipient,
    replyTo: input.email,
    recordEvent: false as const,
    ...contactEmail(input),
  };
}
