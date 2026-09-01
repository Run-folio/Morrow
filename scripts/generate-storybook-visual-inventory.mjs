import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

import { auditWorkspace, DEFAULT_BASELINE_PATH, readBaseline } from "./ui-convergence-audit-lib.mjs";

const ROOTS = ["app/journey", "components"];
const SKIPPED_DIRECTORIES = new Set([".git", ".next", ".next-check", ".next-dev", "node_modules", "storybook-static"]);
const FOUNDATION_STYLESHEET = "app/journey/journey-design.css";
const OUTPUT_PATH = "components/easyt/storybook/morrovia-visual-inventory.generated.json";

async function filesBelow(path) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(entries
    .filter((entry) => !entry.name.startsWith(".") && !SKIPPED_DIRECTORIES.has(entry.name))
    .map((entry) => entry.isDirectory() ? filesBelow(join(path, entry.name)) : [join(path, entry.name)]));
  return nested.flat();
}

function normalized(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function add(grouped, value, path) {
  const key = normalized(value);
  if (!key) return;
  const current = grouped.get(key) ?? { value: key, count: 0, examples: [] };
  current.count += 1;
  if (current.examples.length < 4 && !current.examples.includes(path)) current.examples.push(path);
  grouped.set(key, current);
}

function sorted(grouped) {
  return [...grouped.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function ruleLeaders(currentBaseline, ruleId) {
  return Object.entries(currentBaseline.rules[ruleId] ?? {})
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, 12);
}

const root = resolve(process.cwd());
const files = (await Promise.all(ROOTS.map((path) => filesBelow(join(root, path))))).flat();
const styleFiles = files.filter((file) => [".css", ".scss"].includes(extname(file)));
const textByFile = new Map(await Promise.all(styleFiles.map(async (file) => [file, await readFile(file, "utf8")])));

const rawColors = new Map();
const rawRadii = new Map();
const rawShadows = new Map();
const rawFontFamilies = new Map();
const legacyFontRoles = new Map();
const observedSpacing = new Map();
const breakpoints = new Map();

for (const file of styleFiles) {
  const path = relative(root, file).replaceAll("\\", "/");
  const text = textByFile.get(file);
  if (path !== FOUNDATION_STYLESHEET) {
    for (const match of text.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi)) add(rawColors, match[0], path);
    for (const match of text.matchAll(/border-radius\s*:\s*([^;}{]+)/gi)) {
      if (!/\bvar\s*\(/i.test(match[1])) add(rawRadii, match[1], path);
    }
    for (const match of text.matchAll(/box-shadow\s*:\s*([^;}{]+)/gi)) {
      if (!/^\s*(?:var\s*\(|none\b)/i.test(match[1])) add(rawShadows, match[1], path);
    }
    for (const match of text.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
      if (!/^\s*(?:var\s*\(|inherit\b|initial\b|unset\b|revert\b)/i.test(match[1])) add(rawFontFamilies, match[1], path);
    }
    for (const match of text.matchAll(/(?:font|font-family)\s*:\s*([^;}{]*var\(--(?:font-geist-(?:sans|mono)|font-instrument-serif)\b[^;}{]*)/gi)) {
      if (!/var\(--morrovia-(?:display|ui|meta)\b/i.test(match[1])) add(legacyFontRoles, match[1], path);
    }
  }
  for (const match of text.matchAll(/(?:^|[;{])\s*(?:gap|row-gap|column-gap|padding(?:-(?:block|inline|top|right|bottom|left))?|margin(?:-(?:block|inline|top|right|bottom|left))?)\s*:\s*([^;}{]+)/gim)) {
    for (const value of match[1].matchAll(/(?:^|\s)(\d+(?:\.\d+)?)px\b/g)) add(observedSpacing, `${value[1]}px`, path);
  }
  for (const match of text.matchAll(/@media\s*\((min|max)-width\s*:\s*([^)]+)\)/gi)) add(breakpoints, `${match[1]}-width: ${match[2]}`, path);
}

const foundationText = await readFile(join(root, FOUNDATION_STYLESHEET), "utf8");
const canonicalTokens = [...foundationText.matchAll(/^\s*(--morrovia-[a-z0-9-]+)\s*:\s*([^;]+);/gim)]
  .map((match) => ({ name: match[1], value: match[2].trim() }))
  .sort((a, b) => a.name.localeCompare(b.name));

const baseline = await readBaseline(join(root, DEFAULT_BASELINE_PATH));
const audit = await auditWorkspace({ root, baseline });
const trackedRules = ["native-control", "deprecated-ui-owner", "raw-color", "raw-radius", "raw-shadow", "raw-font-family", "page-local-font-role", "raw-page-width"];

const inventory = {
  version: 1,
  generatedBy: "scripts/generate-storybook-visual-inventory.mjs",
  sources: ROOTS,
  canonicalTokens,
  foundations: {
    rawColors: sorted(rawColors),
    observedSpacing: sorted(observedSpacing),
    rawRadii: sorted(rawRadii),
    rawShadows: sorted(rawShadows),
    rawFontFamilies: sorted(rawFontFamilies),
    legacyFontRoles: sorted(legacyFontRoles),
    breakpoints: sorted(breakpoints),
  },
  audit: {
    totals: audit.totals,
    leaders: Object.fromEntries(trackedRules.map((ruleId) => [ruleId, ruleLeaders(audit.currentBaseline, ruleId)])),
    documentedExceptions: audit.exceptionCount,
  },
};

const output = join(root, OUTPUT_PATH);
await mkdir(resolve(output, ".."), { recursive: true });
await writeFile(output, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
console.log(`Generated ${OUTPUT_PATH}.`);
