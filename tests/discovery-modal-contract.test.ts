import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("one shared dialog owns Escape, scroll lock, focus return and a single scroll body", () => {
  const shell = read("components/easyt/builder-clarification-shell.tsx");
  assert.equal((shell.match(/role="dialog"/g) ?? []).length, 1);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /document\.body\.style\.overflow = "hidden"/);
  assert.match(shell, /returnFocus\?\.focus\(\)/);
  assert.match(shell, /className=\{styles\.body\}/);
  assert.doesNotMatch(shell, /history\.(pushState|popstate)/);
  assert.doesNotMatch(read("components/easyt/discovery-modal.tsx"), /role="dialog"|history\.(pushState|popstate)/);
});

test("normal typed and sparse entries select Discovery; only recovery selects legacy renderer", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  assert.match(builder, /discoveryEntryForBrief\(/);
  assert.match(builder, /renderedDiscoveryEntry\.kind === "legacy-recovery"/);
  assert.match(builder, /<DiscoveryModal/);
  assert.match(builder, /<BuilderClarificationDialog/);
  assert.match(builder, /discoveryEntry\.kind !== "skip"/);
});

test("Back changes only the draft step and does not route browser history", () => {
  const modal = read("components/easyt/discovery-modal.tsx");
  assert.match(modal, /onAction\(\{ type: "set-step", step: previousStep \}\)/);
  assert.doesNotMatch(modal, /history\.(pushState|replaceState|popstate)/);
});
