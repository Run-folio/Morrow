import "server-only";

import OpenAI from "openai";
export { MORROVIA_OPENAI_MODEL } from "./openai-config";

let sharedClient: OpenAI | undefined;

export class OpenAIConfigurationError extends Error {
  constructor() {
    super("OpenAI is not configured.");
    this.name = "OpenAIConfigurationError";
  }
}

/** Lazily creates the shared SDK client so builds do not require live credentials. */
export function getOpenAIClient() {
  if (sharedClient) return sharedClient;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new OpenAIConfigurationError();
  sharedClient = new OpenAI({ apiKey });
  return sharedClient;
}

export type SafeOpenAIError = {
  category: "configuration" | "authentication" | "permission" | "rate-limit" | "invalid-request" | "provider";
  status?: number;
  code?: string;
};

/** Returns only non-secret diagnostics suitable for a server response or log. */
export function safeOpenAIError(error: unknown): SafeOpenAIError {
  if (error instanceof OpenAIConfigurationError) return { category: "configuration" };
  if (!error || typeof error !== "object") return { category: "provider" };
  const detail = error as { status?: unknown; code?: unknown };
  const status = typeof detail.status === "number" ? detail.status : undefined;
  const code = typeof detail.code === "string" ? detail.code : undefined;
  const category = status === 401
    ? "authentication"
    : status === 403
      ? "permission"
      : status === 429
        ? "rate-limit"
        : status !== undefined && status >= 400 && status < 500
          ? "invalid-request"
          : "provider";
  return { category, ...(status === undefined ? {} : { status }), ...(code ? { code } : {}) };
}
