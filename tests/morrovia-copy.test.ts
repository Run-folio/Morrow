import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import test from "node:test";

const workspace = resolve(import.meta.dirname, "..");
const copyRoots = ["app/journey", "components", "lib/easyt", "lib/journey.ts", "lib/country-intelligence.ts"];
const excludedFiles = new Set([
  "lib/easyt/structured-trip-brief.ts", // Developer-only provenance formatter, never production UI.
  "lib/easyt/visa-requirements.ts", // Includes an externally supplied source title.
]);

function sourceFiles(path: string): string[] {
  const absolute = join(workspace, path);
  if (statSync(absolute).isFile()) return [absolute];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? sourceFiles(join(path, entry.name))
    : /\.(?:ts|tsx)$/.test(entry.name) ? [join(absolute, entry.name)] : []);
}

test("Morrovia-controlled product copy does not introduce em dashes", () => {
  const violations = copyRoots.flatMap((root) => sourceFiles(root)).flatMap((file) => {
    const projectPath = relative(workspace, file);
    if (excludedFiles.has(projectPath)) return [];
    return readFileSync(file, "utf8").split("\n").flatMap((line, index) => {
      const trimmed = line.trim();
      return trimmed.includes("—") && !trimmed.startsWith("//") && !trimmed.startsWith("/*") && !trimmed.startsWith("*")
        ? [`${projectPath}:${index + 1}`]
        : [];
    });
  });
  assert.deepEqual(violations, []);
});
