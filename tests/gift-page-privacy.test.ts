import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import type { ReactNode } from "react";

const require = createRequire(import.meta.url);
const React = require("react") as typeof import("react");
const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");
const source = readFileSync(new URL("../app/journey/gift/[token]/page.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const syntheticGift = {
  tripTitle: "Synthetic invitation", senderName: "Synthetic sender", recipientEmail: "a@private-recipient.test",
  note: "Shared synthetic note", status: "pending", expiresAt: "2026-12-01T00:00:00.000Z",
};

type Session = { user: { email: string } } | null;
async function renderGift({ email = syntheticGift.recipientEmail, session = null as Session, status = "pending", missing = false, unavailable = false } = {}) {
  const claimProps: Record<string, unknown>[] = [];
  const previewTokens: string[] = [];
  const exports: { dynamic?: string; default?: (props: { params: Promise<{ token: string }> }) => Promise<ReactNode> } = {};
  runInNewContext(compiled, { exports, require(name: string) {
    if (["react/jsx-runtime", "next/link", "lucide-react", "next/navigation"].includes(name)) return require(name);
    if (name === "next/headers") return { headers: async () => new Headers() };
    if (name === "@/lib/auth") return { getAuth: () => ({ api: { getSession: async () => session } }) };
    if (name === "@/lib/easyt/repository") return { getTripGiftPreview: async (token: string) => {
      previewTokens.push(token);
      if (unavailable) throw new Error("Synthetic unavailable repository");
      return missing ? null : { ...syntheticGift, recipientEmail: email, status };
    } };
    if (name === "../../easyt-navigation") return { default: () => React.createElement("nav", null, "Navigation") };
    if (name === "./claim-gift") return { default: (props: Record<string, unknown>) => {
      claimProps.push(props);
      return React.createElement("button", null, "Claim editable copy");
    } };
    if (name === "../../account.module.css") return { default: new Proxy({}, { get: (_, key) => String(key) }) };
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  assert.equal(exports.dynamic, "force-dynamic", "session-specific recipient rendering must remain dynamic");
  assert.ok(exports.default);
  const tree = await exports.default({ params: Promise.resolve({ token: "synthetic-token" }) });
  return { html: renderToStaticMarkup(tree), claimProps, previewTokens };
}

for (const local of ["a", "al", "alice.long+tag"]) {
  for (const signedIn of [false, true]) test(`${local.length}-character local part is not hinted to ${signedIn ? "another account" : "a signed-out viewer"}`, async () => {
    const email = `${local}@private-recipient.test`;
    const result = await renderGift({ email, session: signedIn ? { user: { email: "other@different-account.test" } } : null });
    assert.doesNotMatch(result.html, /private-recipient\.test|•|giftRecipient/);
    assert.deepEqual(result.claimProps, []);
    assert.deepEqual(result.previewTokens, ["synthetic-token"]);
    assert.match(result.html, /Synthetic invitation/);
    assert.match(result.html, /Shared synthetic note/);
    if (signedIn) {
      assert.match(result.html, /sent to a different email address/);
      assert.doesNotMatch(result.html, /Sign in to claim|Claim editable copy/);
    } else {
      assert.match(result.html, /Sign in to claim/);
      assert.match(result.html, /next=%2Fjourney%2Fgift%2Fsynthetic-token/);
    }
  });
}

test("the matching account sees its own address and only the capability token crosses the claim client boundary", async () => {
  const result = await renderGift({ session: { user: { email: "A@PRIVATE-RECIPIENT.TEST" } } });
  assert.match(result.html, /For a@private-recipient\.test/);
  assert.match(result.html, /Claim editable copy/);
  assert.deepEqual(result.claimProps.map(props => Object.keys(props)), [["token"]]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.claimProps)), [{ token: "synthetic-token" }]);
});

for (const signedIn of [false, true]) test(`expired invitation does not reveal recipient hints to ${signedIn ? "another account" : "a signed-out viewer"}`, async () => {
  const result = await renderGift({ status: "expired", session: signedIn ? { user: { email: "other@different-account.test" } } : null });
  assert.doesNotMatch(result.html, /private-recipient\.test|•|giftRecipient/);
  assert.match(result.html, /invitation expired/);
  assert.deepEqual(result.claimProps, []);
});

test("expired matching invitation keeps the account's own address but does not expose a claim action", async () => {
  const result = await renderGift({ status: "expired", session: { user: { email: syntheticGift.recipientEmail } } });
  assert.match(result.html, /For a@private-recipient\.test/);
  assert.match(result.html, /invitation expired/);
  assert.deepEqual(result.claimProps, []);
});

for (const options of [{ missing: true }, { unavailable: true }]) test(`gift page fails closed for ${options.missing ? "missing" : "unavailable"} preview`, async () => {
  await assert.rejects(renderGift(options), /NEXT_HTTP_ERROR_FALLBACK;404/);
});
