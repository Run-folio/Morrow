import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("persistent account and recovery truth uses the canonical status banner", () => {
  for (const path of [
    "app/journey/dashboard/dashboard-client.tsx",
    "app/journey/trip/trip-mode-client.tsx",
    "components/easyt/trip-shell-client.tsx",
    "components/easyt/trip-shell-resolver.tsx",
  ]) {
    assert.match(read(path), /MorroviaStatusBanner/, `${path} should use the canonical persistent feedback pattern`);
  }

  assert.doesNotMatch(read("app/journey/trip/trip-mode-client.tsx"), /styles\.syncNotice/);
});

test("Storybook covers every persistent status tone at desktop and mobile widths", () => {
  const stories = read("components/easyt/morrovia-feedback.stories.tsx");
  assert.match(stories, /PersistentStatusBanners/);
  assert.match(stories, /Mobile390StatusBanners/);
  for (const tone of ["success", "warning", "danger"]) {
    assert.match(stories, new RegExp(`tone="${tone}"`));
  }
});

test("the convergence guard audits production and shared component roots", () => {
  const audit = read("scripts/ui-convergence-audit-lib.mjs");
  const baseline = JSON.parse(read("scripts/ui-convergence-baseline.json")) as { version: number; rules: Record<string, unknown> };
  assert.match(audit, /\["app\/journey", "components"\]/);
  for (const signal of ["native-control", "raw-color", "raw-radius", "raw-shadow", "raw-font-family", "legacy-ui-import", "storybook-feedback", "storybook-trip-capture", "storybook-luna-copilot", "storybook-overview-readiness", "storybook-privacy-choices", "storybook-structure-owners"]) {
    assert.match(audit, new RegExp(signal));
  }
  assert.equal(baseline.version, 1);
  assert.match(read("scripts/release-gate-smoke.mjs"), /run\("audit:ui"\)/);
});

test("Account uses the canonical paper token and Google branding is narrowly documented", () => {
  const account = read("app/journey/account.module.css");
  const login = read("app/journey/login/login-form.tsx");
  const pageRule = account.match(/^\.page\s*\{[\s\S]*?^\}/m)?.[0] ?? "";

  assert.match(pageRule, /background:\s*var\(--morrovia-paper\);/);
  assert.doesNotMatch(pageRule, /#[0-9a-f]{3,8}\b|rgba?\s*\(/i);
  assert.deepEqual(
    [...login.matchAll(/morrovia-ui-audit-allow-next-line inline-color[^\n]*\n\s*<path fill="(#[0-9A-F]{6})"/g)].map((match) => match[1]),
    ["#4285F4", "#34A853", "#FBBC05", "#EA4335"],
  );
});
