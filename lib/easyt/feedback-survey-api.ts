import { normalizeContextualFeedback } from "./feedback-survey.ts";
import type { FeedbackSurveySubmitResult } from "./feedback-survey-store.ts";

export type FeedbackSurveyApiDependencies = {
  owner: () => Promise<{ id: string }>;
  state: (ownerId: string) => Promise<{ dismissed: boolean; submitted: boolean }>;
  dismiss: (ownerId: string) => Promise<void>;
  submit: (input: { ownerId: string; attemptId: string; rating: number; comment?: string }) => Promise<FeedbackSurveySubmitResult>;
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function handleContextualFeedbackSurvey(request: Request, dependencies: FeedbackSurveyApiDependencies): Promise<Response> {
  let ownerId: string;
  try { ownerId = (await dependencies.owner()).id; }
  catch { return json({ error: "Sign in to continue." }, 401); }
  if (request.method === "GET") {
    try { return json(await dependencies.state(ownerId)); }
    catch { return json({ error: "Survey state is unavailable." }, 503); }
  }
  if (request.method === "PATCH") {
    try { await dependencies.dismiss(ownerId); return json({ dismissed: true }); }
    catch { return json({ error: "Dismissal could not be saved." }, 503); }
  }
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid feedback.");
    body = parsed as Record<string, unknown>;
  } catch { return json({ error: "Enter a valid response." }, 400); }
  if (typeof body.attemptId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.attemptId)) {
    return json({ error: "Invalid submission identity." }, 400);
  }
  let payload: ReturnType<typeof normalizeContextualFeedback>;
  try { payload = normalizeContextualFeedback(body.rating, body.comment); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid feedback." }, 400); }
  try {
    const result = await dependencies.submit({ ownerId, attemptId: body.attemptId, ...payload });
    return json({ result }, result === "created" ? 201 : result === "payload-conflict" ? 409 : 200);
  } catch { return json({ error: "Feedback could not be confirmed. Try again." }, 503); }
}
