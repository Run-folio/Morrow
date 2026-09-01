import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { canonicalUiOwners, visualAuditRecords, visualAuditSummary } from "../components/easyt/storybook/morrovia-visual-system-audit.ts";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

function storyFilesBelow(path: string): string[] {
  const absolute = new URL(path, root).pathname;
  return readdirSync(absolute).flatMap((name) => {
    const child = join(absolute, name);
    if (statSync(child).isDirectory()) return storyFilesBelow(`${path}/${name}`);
    return name.endsWith(".stories.tsx") ? [child] : [];
  });
}

test("every current story is grouped under the stable Morrovia hierarchy", () => {
  const files = [...storyFilesBelow("app"), ...storyFilesBelow("components")];
  assert.ok(files.length >= 20);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /title:\s*"Morrovia\/(?:01 Foundations|02 Controls|03 Status & Feedback|04 Structure|05 Product Patterns|06 Audit)/, file);
  }
});

test("the visual foundations and audit stories keep every required catalogue surface", () => {
  const foundations = read("components/easyt/storybook/morrovia-foundation-catalogue.stories.tsx");
  for (const marker of ["Typography", "Colours", "Spacing", "BordersAndRadii", "Shadows", "Icons", "LayoutAndWidths", "Breakpoints"]) assert.match(foundations, new RegExp(marker));

  const audit = read("components/easyt/storybook/morrovia-audit-catalogue.stories.tsx");
  for (const marker of ["InventoryAndOwnership", "TypographyComparison", "ColourComparison", "ButtonComparison", "FormControlComparison", "CardComparison", "StatusComparison", "NavigationComparison", "ProductPatternComparison", "ResponsiveComparison", "IntentionalExceptions"]) assert.match(audit, new RegExp(marker));
});

test("the typography foundation distinguishes readable prose from compact metadata", () => {
  const catalogue = read("components/easyt/storybook/morrovia-storybook-catalogue.tsx");
  for (const role of ["Display", "Page heading", "Section heading", "Body", "Supporting body", "Control", "Metadata", "Eyebrow", "Fine print / provenance"]) {
    assert.match(catalogue, new RegExp(`\\[\\"${role}\\"`), role);
  }
  assert.doesNotMatch(catalogue, /\["Body small"/);
});

test("every audit record names ownership, consumers, differences, coverage and review status", () => {
  const valid = new Set(["CANONICAL", "DUPLICATE / MIGRATION CANDIDATE", "INTENTIONAL EXCEPTION", "UNDECIDED"]);
  for (const record of visualAuditRecords) {
    assert.ok(record.family.trim());
    assert.ok(record.semanticJob.trim());
    assert.ok(record.implementation.trim());
    assert.ok(record.owner.trim());
    assert.ok(record.consumers.length);
    assert.ok(record.differences.trim());
    assert.ok(record.storybookCoverage.trim());
    assert.ok(record.migrationStatus.trim());
    assert.ok(valid.has(record.classification));
    if (record.classification === "INTENTIONAL EXCEPTION") assert.ok(record.canonicalReference?.trim(), `${record.implementation}: canonical reference`);
  }
  const summary = visualAuditSummary();
  assert.equal(summary.records, visualAuditRecords.length);
  assert.ok(summary.families >= 20);
  assert.ok(summary.duplicateFamilies > 0);
  assert.equal(Object.values(summary.counts).reduce((sum, count) => sum + count, 0), visualAuditRecords.length);
  assert.equal(summary.counts.UNDECIDED, 0, "final catalogue must classify every recurring family");
  assert.equal(
    visualAuditRecords.some((record) => record.family === "Typography" && record.semanticJob === "Font-family declarations"),
    false,
    "completed typography-role migration must not remain catalogued as duplicate debt",
  );
});

test("the compact canonical ownership map covers every recurring product family", () => {
  assert.deepEqual(canonicalUiOwners.map((record) => record.family), [
    "Button",
    "Field",
    "Segmented selection",
    "Card",
    "Status",
    "Contextual disclosure",
    "Privacy choice",
    "Progress",
    "Trip capture",
    "Trip navigation",
    "Route row",
    "Itinerary row",
    "Recommendation",
    "Booking/readiness action",
    "Trip health",
    "Map overlay",
    "AI / Copilot",
  ]);
  for (const record of canonicalUiOwners) {
    assert.ok(record.semanticJob.trim(), record.family);
    assert.ok(record.owner.trim(), record.family);
    assert.ok(record.storybookCoverage.trim(), record.family);
    assert.ok(record.meaningfulStates.length, record.family);
    assert.ok(record.boundary.trim(), record.family);
  }
});

test("the generated visual inventory is deterministic, grouped and wired into Storybook", () => {
  const inventory = JSON.parse(read("components/easyt/storybook/morrovia-visual-inventory.generated.json")) as {
    version: number;
    generatedAt?: string;
    canonicalTokens: Array<{ name: string; value: string }>;
    foundations: Record<string, Array<{ value: string; count: number; examples: string[] }>>;
    audit: { totals: Record<string, number>; leaders: Record<string, Array<{ path: string; count: number }>> };
  };
  assert.equal(inventory.version, 1);
  assert.equal(inventory.generatedAt, undefined);
  assert.ok(inventory.canonicalTokens.some((token) => token.name === "--morrovia-ink"));
  for (const key of ["rawColors", "observedSpacing", "rawRadii", "rawShadows", "breakpoints"]) assert.ok(inventory.foundations[key].length, key);
  assert.deepEqual(inventory.foundations.legacyFontRoles, [], "canonical typography roles leave no legacy framework-font consumers");
  assert.deepEqual(inventory.foundations.rawFontFamilies, []);
  assert.ok(inventory.audit.totals["raw-color"] > 0);
  assert.ok(inventory.audit.leaders["native-control"].length > 0);

  const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  assert.match(packageJson.scripts.storybook, /storybook:inventory/);
  assert.match(packageJson.scripts["build-storybook"], /storybook:inventory/);
  assert.doesNotMatch(
    read("components/easyt/storybook/morrovia-storybook-catalogue.tsx"),
    /Legacy direct font roles/,
    "completed typography debt must not remain as an empty Storybook comparison",
  );
});

test("major responsive patterns expose the agreed Storybook review widths", () => {
  const preview = read(".storybook/preview.ts");
  for (const width of [320, 390, 768, 1024, 1440]) assert.match(preview, new RegExp(`morrovia${width}`));
  for (const section of ["01 Foundations", "02 Controls", "03 Status & Feedback", "04 Structure", "05 Product Patterns", "06 Audit"]) {
    assert.match(preview, new RegExp(section.replace(/[&]/g, "\\&")));
  }
  assert.match(preview, /value:\s*"var\(--morrovia-paper\)"/, "Storybook background must use the production surface token");
  for (const path of ["components/easyt/trip-itinerary-workspace.stories.tsx", "components/easyt/trip-map-workspace.stories.tsx", "components/easyt/trip-shell.stories.tsx"]) {
    const source = read(path);
    for (const marker of ["Mobile", "Tablet768", "Desktop1024", "Desktop1440"]) assert.match(source, new RegExp(marker), `${path}: ${marker}`);
    assert.match(source, /globals:\s*\{\s*viewport:\s*\{\s*value:/, `${path}: Storybook 10 viewport globals`);
    assert.doesNotMatch(source, /defaultViewport/, `${path}: legacy viewport parameters no longer apply a viewport in Storybook 10`);
  }
});

test("design-system documentation makes Storybook the living visual reference without authorising broad migration", () => {
  const docs = read("docs/design-system.md");
  assert.match(docs, /Storybook is the canonical visual and interaction reference/);
  assert.match(docs, /DUPLICATE \/ MIGRATION CANDIDATE/);
  assert.match(docs, /do not authorise a migration/);
  assert.match(docs, /does not depend on a running production\s+server/);
  assert.match(docs, /Storybook-specific code is limited to fixtures, decorators and controlled demo wrappers/);
});
