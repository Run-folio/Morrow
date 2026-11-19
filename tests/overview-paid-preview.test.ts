import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const standardBuildEnv = { ...process.env, NETLIFY: "false", SITE_ID: "", BRANCH: "", MORROVIA_INERT_OVERVIEW_PAID_PREVIEW: "" };
const stage = { NETLIFY: "true", SITE_ID: "854ed510-cdd4-48cb-abb3-31b53ad9999f", BRANCH: "staging" };

const run = (source: string, vars: Record<string, string>) => JSON.parse(execFileSync(process.execPath, [
  "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types", "--input-type=module", "-e", source,
], { cwd: root, env: { ...standardBuildEnv, ...vars }, encoding: "utf8" }));

test("only the dedicated Netlify site and exact staging branch set the client build flag", () => {
  const script = 'import config from "./next.config.ts"; console.log(JSON.stringify(config.env.MORROVIA_INERT_OVERVIEW_PAID_PREVIEW));';
  assert.equal(run(script, { ...stage, CONTEXT: "production" }), "1", "dedicated staging site may deploy in its own production context");
  assert.equal(run(script, { ...stage, BRANCH: "main" }), "0");
  assert.equal(run(script, { ...stage, NETLIFY: "false" }), "0");
  assert.equal(run(script, { ...stage, SITE_ID: "57322ca8-6756-447d-95f9-7bfb25a5f288" }), "0");
  assert.equal(run(script, { CONTEXT: "branch-deploy", BRANCH: "staging", MORROVIA_INERT_OVERVIEW_PAID_PREVIEW: "1" }), "0");
});

test("only staging Overview booking/readiness payloads redact the two sponsor URLs, preserving other data", () => {
  const script = `
    import { redactOverviewBookingLinks, redactOverviewReadinessLinks } from "./lib/easyt/overview-paid-preview.ts";
    const actions = [
      { provider:"saily", href:"https://example.invalid/saily", affiliate:true, cta:"Check eSIM coverage" },
      { provider:"world-nomads", href:"https://example.invalid/insurance", affiliate:true, cta:"Get a travel insurance quote" },
      { provider:"viator", href:"https://example.invalid/viator", affiliate:true },
    ];
    const cards = [
      { id:"insurance", partner:"world-nomads", href:"https://example.invalid/insurance", status:"to-review" },
      { id:"esim", href:"https://example.invalid/saily-fallback" },
      { id:"entry", href:"https://example.invalid/entry" },
    ];
    const bySurface = surface => ({ actions: redactOverviewBookingLinks(actions, surface), cards: redactOverviewReadinessLinks(cards, surface) });
    console.log(JSON.stringify({ overview: bySurface("overview"), generic: bySurface(undefined), other: bySurface("itinerary") }));
  `;
  const production = run(script, { MORROVIA_INERT_OVERVIEW_PAID_PREVIEW: "0" });
  const preview = run(script, { MORROVIA_INERT_OVERVIEW_PAID_PREVIEW: "1" });
  assert.deepEqual(production.overview, production.generic);
  assert.deepEqual(preview.generic, production.generic);
  assert.deepEqual(preview.other, production.generic);
  assert.deepEqual(preview.overview.actions, [
    { ...production.overview.actions[0], href: "#overview-preview-saily" },
    { ...production.overview.actions[1], href: "#overview-preview-wn" },
    production.overview.actions[2],
  ]);
  assert.deepEqual(preview.overview.cards, [
    { ...production.overview.cards[0], href: "#overview-preview-wn" },
    { ...production.overview.cards[1], href: "#overview-preview-saily", partner: "saily" },
    production.overview.cards[2],
  ]);
});
