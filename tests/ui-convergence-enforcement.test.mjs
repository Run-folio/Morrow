import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { auditWorkspace, formatAuditReport, readBaseline, writeBaseline } from "../scripts/ui-convergence-audit-lib.mjs";

const emptyBaseline = { version: 1, rules: {} };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "morrovia-ui-audit-"));
  await mkdir(join(root, "app/journey"), { recursive: true });
  await mkdir(join(root, "components"), { recursive: true });
  return root;
}

test("a representative raw token violation fails and its canonical correction passes", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "app/journey/example.module.css");
  await writeFile(path, ".example { color: #123456; }\n");

  const failed = await auditWorkspace({ root, baseline: emptyBaseline, contracts: [] });
  assert.equal(failed.increases.length, 1);
  assert.equal(failed.increases[0].rule.id, "raw-color");
  assert.match(formatAuditReport(failed), /app\/journey\/example\.module\.css:1/);
  assert.match(formatAuditReport(failed), /--morrovia-\* semantic colour token/);

  await writeFile(path, ".example { color: var(--morrovia-ink); }\n");
  const passed = await auditWorkspace({ root, baseline: emptyBaseline, contracts: [] });
  assert.equal(passed.increases.length, 0);
  assert.equal(passed.directiveErrors.length, 0);
});

test("token-aware typography and shadow rules ignore canonical values without overlooking raw declarations", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "app/journey/example.module.css");
  await writeFile(path, [
    ".canonical { font-family: var(--morrovia-ui); box-shadow: var(--morrovia-shadow-overlay); }",
    ".canonicalFocus { box-shadow: var(--morrovia-focus-shadow); }",
    ".inherited { font-family: inherit; box-shadow: none; }",
    ".raw { font-family: Georgia, serif; box-shadow: 0 18px 42px rgb(25 20 70 / 18%); }",
    "",
  ].join("\n"));

  const result = await auditWorkspace({ root, baseline: emptyBaseline, contracts: [] });
  assert.equal(result.increases.filter((item) => item.rule.id === "raw-font-family").length, 1);
  assert.equal(result.increases.filter((item) => item.rule.id === "raw-shadow").length, 1);
  assert.equal(result.currentBaseline.rules["raw-font-family"]?.["app/journey/example.module.css"], 1);
  assert.equal(result.currentBaseline.rules["raw-shadow"]?.["app/journey/example.module.css"], 1);
});

test("page-local font roles and retired UI owners cannot be introduced", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "app/journey/example.module.css"), [
    ".canonical { font: 700 12px var(--morrovia-meta); }",
    ".legacy { font-family: var(--font-geist-sans, Arial, sans-serif); }",
    "",
  ].join("\n"));
  await writeFile(join(root, "app/journey/example.tsx"), 'import OldPrep from "@/components/easyt/trip-prep-workspace";\nexport default OldPrep;\n');

  const result = await auditWorkspace({ root, baseline: emptyBaseline, contracts: [] });
  assert.equal(result.currentBaseline.rules["page-local-font-role"]?.["app/journey/example.module.css"], 1);
  assert.equal(result.currentBaseline.rules["deprecated-ui-owner"]?.["app/journey/example.tsx"], 1);
  assert.equal(result.increases.find((item) => item.rule.id === "deprecated-ui-owner")?.rule.allowException, false);
});

test("a narrow exception needs a substantive reason and applies only to the next matching line", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "app/journey/map.module.css");
  await writeFile(path, [
    "/* morrovia-ui-audit-allow-next-line raw-shadow -- map overlay must remain above provider-owned controls */",
    ".overlay { box-shadow: 0 18px 42px rgb(25 20 70 / 18%); }",
    "",
  ].join("\n"));

  const excepted = await auditWorkspace({ root, baseline: emptyBaseline, contracts: [] });
  assert.equal(excepted.exceptionCount, 1);
  assert.equal(excepted.increases.filter((item) => item.rule.id === "raw-shadow").length, 0);
  assert.equal(excepted.increases.filter((item) => item.rule.id === "raw-color").length, 1, "an exception for one rule must not suppress another");

  await writeFile(path, [
    "/* morrovia-ui-audit-allow-next-line raw-shadow -- temporary */",
    ".overlay { box-shadow: 0 18px 42px rgb(25 20 70 / 18%); }",
    "",
  ].join("\n"));
  const vague = await auditWorkspace({ root, baseline: emptyBaseline, contracts: [] });
  assert.equal(vague.directiveErrors.length, 1);
  assert.match(vague.directiveErrors[0].message, /specific reason/);
});

test("Google provider colours have exact mark-only exceptions while Login and other files stay strict", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const loginPath = join(root, "app/journey/login-form.tsx");
  const elsewherePath = join(root, "components/example.tsx");
  const providerMark = [
    "export function GoogleMark() { return <svg>",
    "{/* morrovia-ui-audit-allow-next-line inline-color -- Official Google provider blue must retain exact brand fidelity. */}",
    '<path fill="#4285F4" />',
    "{/* morrovia-ui-audit-allow-next-line inline-color -- Official Google provider green must retain exact brand fidelity. */}",
    '<path fill="#34A853" />',
    "{/* morrovia-ui-audit-allow-next-line inline-color -- Official Google provider yellow must retain exact brand fidelity. */}",
    '<path fill="#FBBC05" />',
    "{/* morrovia-ui-audit-allow-next-line inline-color -- Official Google provider red must retain exact brand fidelity. */}",
    '<path fill="#EA4335" />',
    "</svg>; }",
    "",
  ].join("\n");
  await writeFile(loginPath, providerMark);

  const providerOnly = await auditWorkspace({ root, baseline: emptyBaseline, contracts: [] });
  assert.equal(providerOnly.exceptionCount, 4);
  assert.equal(providerOnly.increases.length, 0);
  assert.equal(providerOnly.directiveErrors.length, 0);

  await writeFile(loginPath, `${providerMark}<span data-colour="#123456" />\n`);
  const loginDrift = await auditWorkspace({ root, baseline: emptyBaseline, contracts: [] });
  assert.equal(loginDrift.increases.length, 1);
  assert.equal(loginDrift.increases[0].rule.id, "inline-color");
  assert.equal(loginDrift.increases[0].path, "app/journey/login-form.tsx");
  assert.equal(loginDrift.increases[0].now, 1);

  await writeFile(elsewherePath, 'export const colour = "#654321";\n');
  const widerDrift = await auditWorkspace({ root, baseline: emptyBaseline, contracts: [] });
  assert.equal(widerDrift.increases.filter((item) => item.rule.id === "inline-color").length, 2);
  assert.deepEqual(
    widerDrift.increases.filter((item) => item.rule.id === "inline-color").map((item) => item.path).sort(),
    ["app/journey/login-form.tsx", "components/example.tsx"],
  );
});

test("per-file baselines cannot offset new drift and accepted debt can only be lowered", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const oldPath = join(root, "app/journey/old.module.css");
  const newPath = join(root, "app/journey/new.module.css");
  await writeFile(oldPath, ".old { color: var(--morrovia-ink); }\n");
  await writeFile(newPath, ".new { color: #123456; }\n");
  const baseline = { version: 1, rules: { "raw-color": { "app/journey/old.module.css": 1 } } };

  const moved = await auditWorkspace({ root, baseline, contracts: [] });
  assert.equal(moved.reductions.length, 1);
  assert.equal(moved.increases.length, 1);
  assert.equal(moved.increases[0].path, "app/journey/new.module.css");

  await writeFile(newPath, ".new { color: var(--morrovia-ink); }\n");
  const cleaned = await auditWorkspace({ root, baseline, contracts: [] });
  assert.equal(cleaned.increases.length, 0);
  assert.equal(cleaned.reductions.length, 1);
  const baselinePath = join(root, "baseline.json");
  await writeBaseline(baselinePath, cleaned.currentBaseline);
  assert.deepEqual(await readBaseline(baselinePath), emptyBaseline);
  assert.doesNotMatch(await readFile(baselinePath, "utf8"), /old\.module/);
});
