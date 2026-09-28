import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { handleContextualFeedbackSurvey, type FeedbackSurveyApiDependencies } from "../lib/easyt/feedback-survey-api.ts";

function deps(overrides: Partial<FeedbackSurveyApiDependencies> = {}): FeedbackSurveyApiDependencies {
  return {
    owner: async () => ({ id: "server-owner" }),
    state: async () => ({ dismissed: false, submitted: false }),
    dismiss: async () => {},
    submit: async () => "created",
    ...overrides,
  };
}
const url = "https://local.test/api/easyt/feedback/survey";
const attemptId = "00000000-0000-4000-8000-000000000001";
function request(method: string, body?: unknown) { return new Request(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); }

test("GET reads authenticated survey state", async () => {
  const response = await handleContextualFeedbackSurvey(request("GET"), deps({ state: async (id) => { assert.equal(id, "server-owner"); return { dismissed: true, submitted: false }; } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { dismissed: true, submitted: false });
});
test("unauthenticated and unreadable state fail closed", async () => {
  assert.equal((await handleContextualFeedbackSurvey(request("GET"), deps({ owner: async () => { throw new Error("Unauthorized"); } }))).status, 401);
  assert.equal((await handleContextualFeedbackSurvey(request("GET"), deps({ state: async () => { throw new Error("db unavailable"); } }))).status, 503);
});
test("POST rejects invalid rating, UUID and long note", async () => {
  for (const body of [{ attemptId, rating: 0 }, { attemptId: "bad", rating: 3 }, { attemptId, rating: 2, comment: "x".repeat(1001) }]) {
    assert.equal((await handleContextualFeedbackSurvey(request("POST", body), deps())).status, 400);
  }
});
test("POST uses authenticated owner and classifies replay or conflict", async () => {
  const calls: string[] = [];
  const input = { attemptId, rating: 4, ownerId: "forged-owner", comment: "useful" };
  const created = await handleContextualFeedbackSurvey(request("POST", input), deps({ submit: async (value) => { calls.push(value.ownerId); return "created"; } }));
  assert.equal(created.status, 201);
  assert.deepEqual(calls, ["server-owner"]);
  for (const [result, status] of [["replayed", 200], ["already-submitted", 200], ["payload-conflict", 409]] as const) {
    const response = await handleContextualFeedbackSurvey(request("POST", input), deps({ submit: async () => result }));
    assert.equal(response.status, status);
    assert.equal((await response.json()).result, result);
  }
});
test("PATCH dismisses under the authenticated owner and ordinary endpoint stays distinct", async () => {
  let owner = "";
  const response = await handleContextualFeedbackSurvey(request("PATCH"), deps({ dismiss: async (id) => { owner = id; } }));
  assert.equal(response.status, 200); assert.equal(owner, "server-owner");
  const oldRoute = readFileSync(new URL("../app/api/easyt/feedback/route.ts", import.meta.url), "utf8");
  assert.match(oldRoute, /createEasyTFeedback/);
});
