import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

export const AUDIT_ROOTS = ["app/journey", "components"];
export const BASELINE_VERSION = 1;
export const DEFAULT_BASELINE_PATH = "scripts/ui-convergence-baseline.json";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const STYLE_EXTENSIONS = new Set([".css", ".scss"]);
const SKIPPED_DIRECTORIES = new Set([".git", ".next", ".next-check", ".next-dev", "node_modules", "storybook-static"]);
const FOUNDATION_STYLESHEET = "app/journey/journey-design.css";
const MINIMUM_EXCEPTION_REASON_LENGTH = 20;

const nativeControlOwners = new Set([
  "app/journey/easyt-navigation.tsx",
  "components/easyt/easyt-controls.tsx",
  "components/easyt/morrovia-date-picker.tsx",
  "components/easyt/morrovia-feedback.tsx",
  "components/easyt/morrovia-quantity-selector.tsx",
  "components/ui.tsx",
]);

const rule = (definition) => ({ allowException: true, ...definition });

export const RULES = [
  rule({
    id: "native-control",
    files: "source",
    pattern: /<(?:button|input|select|textarea)\b/g,
    ignorePath: (path) => nativeControlOwners.has(path),
    ignoreMatch: ({ text, index }) => {
      const tagEnd = text.indexOf(">", index);
      const tag = text.slice(index, tagEnd === -1 ? index + 400 : tagEnd + 1);
      return /\btype\s*=\s*["'](?:checkbox|color|date|file|hidden|number|radio|range)["']/.test(tag);
    },
    alternative: "Use EasyTButton, EasyTLinkButton, EasyTField, EasyTSelect or EasyTTextArea from components/easyt/easyt-controls.tsx.",
  }),
  rule({
    id: "native-date-input",
    files: "source",
    pattern: /<input\b(?:(?!>).)*\btype\s*=\s*["']date["'](?:(?!>).)*>/gs,
    ignorePath: (path) => path === "components/easyt/morrovia-date-picker.tsx",
    alternative: "Use MorroviaDatePicker from components/easyt/morrovia-date-picker.tsx.",
  }),
  rule({
    id: "native-number-input",
    files: "source",
    pattern: /<input\b(?:(?!>).)*\btype\s*=\s*["']number["'](?:(?!>).)*>/gs,
    ignorePath: (path) => path === "components/easyt/morrovia-quantity-selector.tsx",
    alternative: "Use MorroviaQuantitySelector from components/easyt/morrovia-quantity-selector.tsx.",
  }),
  rule({
    id: "native-dialog",
    files: "source",
    pattern: /<dialog\b/g,
    ignorePath: (path) => path === "components/easyt/morrovia-feedback.tsx",
    alternative: "Use MorroviaConfirmationDialog from components/easyt/morrovia-feedback.tsx.",
  }),
  rule({
    id: "native-confirm",
    files: "source",
    pattern: /\b(?:window|globalThis)\.confirm\s*\(/g,
    alternative: "Use MorroviaConfirmationDialog so focus, recovery copy and mobile behaviour remain consistent.",
  }),
  rule({
    id: "legacy-ui-import",
    files: "source",
    pattern: /from\s+["'](?:@\/components\/ui|(?:\.\.\/)+components\/ui|(?:\.\.\/)+ui)["']/g,
    appliesTo: (path) => path.startsWith("app/journey/") || path.startsWith("components/easyt/") || /^components\/journey/.test(path),
    allowException: false,
    alternative: "Import the canonical production component from components/easyt/ or keep a genuinely page-specific composite local.",
  }),
  rule({
    id: "deprecated-ui-owner",
    files: "source",
    pattern: /(?:from\s+|import\s*\(\s*)["'][^"']*(?:trip-prep-workspace|journey-booking-readiness|journey-trip-prep-accommodation|journey-trip-readiness|trip-prep-client)(?:\.module\.css)?["']/g,
    allowException: false,
    alternative: "Use TripOverviewWorkspace with TripPreparationTaskSection and the current trip readiness selectors; the former Prep/readiness UI owners were retired.",
  }),
  rule({
    id: "raw-color",
    files: "style",
    pattern: /(?:#[0-9a-f]{3,8}\b|\brgba?\s*\()/gi,
    ignorePath: (path) => path === FOUNDATION_STYLESHEET,
    alternative: "Use the closest --morrovia-* semantic colour token from app/journey/journey-design.css.",
  }),
  rule({
    id: "raw-radius",
    files: "style",
    pattern: /border-radius\s*:\s*(?:\d+(?:\.\d+)?(?:px|rem)|999px|50%)/gi,
    ignorePath: (path) => path === FOUNDATION_STYLESHEET,
    alternative: "Use --morrovia-control-radius or --morrovia-radius when the semantic role matches.",
  }),
  rule({
    id: "raw-shadow",
    files: "style",
    pattern: /box-shadow\s*:(?!\s*(?:var\(|none\b))[^;}{]+/gi,
    ignorePath: (path) => path === FOUNDATION_STYLESHEET,
    alternative: "Use --morrovia-focus-shadow for the canonical 3px focus treatment, --morrovia-shadow-overlay for overlay hierarchy, or document why this component needs a distinct elevation contract.",
  }),
  rule({
    id: "raw-font-family",
    files: "style",
    pattern: /font-family\s*:(?!\s*(?:var\(|inherit\b|initial\b|unset\b|revert\b))[^;}{]+/gi,
    ignorePath: (path) => path === FOUNDATION_STYLESHEET,
    alternative: "Use --morrovia-display, --morrovia-ui or --morrovia-meta.",
  }),
  rule({
    id: "page-local-font-role",
    files: "style",
    pattern: /(?:font|font-family)\s*:(?![^;}{]*var\(--morrovia-(?:display|ui|meta)\b)[^;}{]*var\(--(?:font-geist-(?:sans|mono)|font-instrument-serif)\b/gi,
    ignorePath: (path) => path === FOUNDATION_STYLESHEET,
    alternative: "Use --morrovia-display, --morrovia-ui or --morrovia-meta instead of addressing framework font variables from page CSS.",
  }),
  rule({
    id: "raw-page-width",
    files: "all",
    pattern: /(?<!-)(?:max-width|width|padding|right|left)\s*:[^;{}]*\b1180px\b/gi,
    ignorePath: (path) => path === FOUNDATION_STYLESHEET,
    alternative: "Use --morrovia-page instead of copying the 1180px canonical page width.",
  }),
  rule({
    id: "inline-color",
    files: "source",
    pattern: /["'`]#[0-9a-f]{3,8}\b/gi,
    alternative: "Move the visual value into CSS and use the closest --morrovia-* semantic colour token.",
  }),
  rule({
    id: "inline-radius",
    files: "source",
    pattern: /\bborderRadius\s*:\s*(?:["'`])?\d+(?:\.\d+)?(?:px|rem)?/g,
    alternative: "Move the style into CSS and use a --morrovia-radius-* token.",
  }),
  rule({
    id: "inline-shadow",
    files: "source",
    pattern: /\bboxShadow\s*:\s*["'`][^"'`]+["'`]/g,
    alternative: "Move the style into CSS and use --morrovia-shadow-overlay where its semantics fit.",
  }),
  rule({
    id: "inline-font-family",
    files: "source",
    pattern: /\bfontFamily\s*:\s*["'`](?!var\()[^"'`]+["'`]/g,
    alternative: "Move the style into CSS and use --morrovia-display, --morrovia-ui or --morrovia-meta.",
  }),
];

export const STORYBOOK_CONTRACTS = [
  {
    id: "storybook-visual-foundations",
    path: "components/easyt/storybook/morrovia-foundation-catalogue.stories.tsx",
    required: ["Typography", "Colours", "Spacing", "BordersAndRadii", "Shadows", "Icons", "LayoutAndWidths", "Breakpoints"],
    alternative: "Keep every canonical foundation and the current raw-value inventory visually available in Storybook.",
  },
  {
    id: "storybook-visual-audit",
    path: "components/easyt/storybook/morrovia-audit-catalogue.stories.tsx",
    required: ["InventoryAndOwnership", "CanonicalOwnership", "TypographyComparison", "ColourComparison", "ButtonComparison", "FormControlComparison", "CardComparison", "StatusComparison", "NavigationComparison", "ProductPatternComparison", "ResponsiveComparison", "IntentionalExceptions"],
    alternative: "Keep canonical, migration-candidate, intentional-exception and undecided comparisons visible in Storybook.",
  },
  {
    id: "storybook-controls",
    path: "components/easyt/easyt-controls.stories.tsx",
    required: ["EasyTButton", "EasyTField", "EasyTSelect", "EasyTSegmentedControl", "SegmentedMobile390", "NarrowScreen"],
    alternative: "Keep desktop, validation, segmented-selection and narrow-screen stories for the canonical shared controls.",
  },
  {
    id: "storybook-form-controls",
    path: "components/easyt/morrovia-form-controls.stories.tsx",
    required: ["EasyTTextArea", "MorroviaDatePicker", "MorroviaQuantitySelector", "DatePickerMobile390", "TravellerMobile390"],
    alternative: "Keep date and quantity states, including 390px mobile coverage, in the canonical form-controls stories.",
  },
  {
    id: "storybook-feedback",
    path: "components/easyt/morrovia-feedback.stories.tsx",
    required: ["MorroviaBriefNotice", "MorroviaConfirmationDialog", "MorroviaContextualDisclosure", "MorroviaRecoveryFeedback", "MorroviaSaveStatus", "MorroviaStatusBanner", "ContextualTransparencyDisclosure", "DialogFocusAndRestore", "PersistentStatusBanners", "Mobile390StatusBanners", "Mobile390Dialog"],
    alternative: "Keep persistent, disclosure, focus-managed dialog and mobile states in the canonical Morrovia feedback stories.",
  },
  {
    id: "storybook-privacy-choices",
    path: "components/privacy-consent.stories.tsx",
    required: ["PrivacyConsent", "CookiePreferences", "FirstVisit", "FirstVisitMobile390", "CookieSettings"],
    alternative: "Keep first-visit consent and editable cookie preferences represented with mobile coverage.",
  },
  {
    id: "storybook-loading",
    path: "components/easyt/morrovia-loading-states.stories.tsx",
    required: ["MorroviaSkeleton", "MorroviaSectionStatus", "MorroviaPlanningProgress", "MorroviaMapLoading", "Mobile390Planning", "Tablet768Map"],
    alternative: "Keep canonical loading components and representative mobile/tablet states in Storybook.",
  },
  {
    id: "storybook-trip-capture",
    path: "components/easyt/morrovia-trip-capture.stories.tsx",
    required: ["MorroviaTripCapture", "AIAndSpeechTransparency", "Filled", "Loading", "Error", "Mobile320", "Mobile390", "Tablet768"],
    alternative: "Keep the production Trip Capture owner visible with transparency, filled, loading, error and responsive states.",
  },
  {
    id: "storybook-luna-copilot",
    path: "components/easyt/easyt-trip-copilot.stories.tsx",
    required: ["EasyTTripCopilot", "NormalAnswer", "ProposedChange", "ProviderFailure", "Mobile390"],
    alternative: "Keep Luna's actual production component visible for answers, reviewed changes, provider failure and mobile layout.",
  },
  {
    id: "storybook-overview-readiness",
    path: "components/easyt/trip-overview-workspace.stories.tsx",
    required: ["TripOverviewWorkspace", "HealthIssue", "ReadyTrip", "AllPreparationIncomplete", "ProviderUnavailable", "MissingOptionalData", "Mobile320", "Mobile390", "Tablet768", "Desktop1024", "Desktop1440"],
    alternative: "Keep Overview, Trip Health, readiness, provider-unavailable, partial-data and major responsive states in Storybook.",
  },
  {
    id: "storybook-product-owners",
    path: "components/easyt/storybook/morrovia-product-pattern-catalogue.stories.tsx",
    required: ["TripPreparationTaskSection", "EasyTTripCopilot", "PreparationAndReadinessTask", "RouteDiscoveryResults", "PassportWorkflow", "CopilotAt390", "PassportAt390"],
    alternative: "Keep the production readiness, AI, route-discovery and Passport owners represented without Storybook-only recreations.",
  },
  {
    id: "storybook-structure-owners",
    path: "components/easyt/storybook/morrovia-structure-catalogue.stories.tsx",
    required: ["MorroviaConfirmationDialog", "EasyTProductTour", "EasyTNavigation", "TripShellNavigation", "ConsequentialDialog", "ProductTourDialog", "MobileDock390"],
    alternative: "Keep the actual confirmation, product-tour and navigation owners represented in the Structure catalogue.",
  },
  {
    id: "storybook-trip-shell",
    path: "components/easyt/trip-shell.stories.tsx",
    required: ["TripShell", "Overview", "Itinerary", "MapWorkspace", "Mobile320", "Tablet768", "Desktop1024", "Desktop1440"],
    alternative: "Keep every TripShell workspace plus the mobile shell state in Storybook.",
  },
  {
    id: "storybook-itinerary-responsive",
    path: "components/easyt/trip-itinerary-workspace.stories.tsx",
    required: ["Mobile320", "Mobile390", "Tablet768", "Desktop1024", "Desktop1440"],
    alternative: "Keep the production Itinerary workspace visible across the major responsive review widths.",
  },
  {
    id: "storybook-map-responsive",
    path: "components/easyt/trip-map-workspace.stories.tsx",
    required: ["Mobile320", "Mobile390", "Tablet768", "Desktop1024", "Desktop1440"],
    alternative: "Keep the production Map workspace visible across the major responsive review widths.",
  },
];

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

function lineDetails(text, index) {
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = text.indexOf("\n", index);
  return {
    line,
    column: index - lineStart + 1,
    excerpt: text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim().slice(0, 180),
  };
}

function exceptionDirectives(text, path) {
  const directives = [];
  text.split("\n").forEach((line, index) => {
    if (!line.includes("morrovia-ui-audit-allow-next-line")) return;
    const match = line.match(/morrovia-ui-audit-allow-next-line\s+([a-z0-9-]+)\s+--\s+(.+?)(?:\s*\*\/)?\s*$/);
    directives.push({ path, line: index + 1, targetLine: index + 2, ruleId: match?.[1], reason: match?.[2]?.trim(), validSyntax: Boolean(match), used: false });
  });
  return directives;
}

function validateDirectives(directives, ruleById) {
  const errors = [];
  for (const directive of directives) {
    if (!directive.validSyntax) {
      errors.push({ ...directive, message: "Use: morrovia-ui-audit-allow-next-line <rule-id> -- <specific reason>." });
      continue;
    }
    const matchedRule = ruleById.get(directive.ruleId);
    if (!matchedRule) errors.push({ ...directive, message: `Unknown rule '${directive.ruleId}'.` });
    else if (!matchedRule.allowException) errors.push({ ...directive, message: `${directive.ruleId} does not permit local exceptions.` });
    else if (directive.reason.length < MINIMUM_EXCEPTION_REASON_LENGTH || /^(?:todo|temporary|needed|exception|ignore)\b/i.test(directive.reason)) {
      errors.push({ ...directive, message: `Give a specific reason of at least ${MINIMUM_EXCEPTION_REASON_LENGTH} characters.` });
    }
  }
  return errors;
}

function cleanBaseline(debt) {
  const rules = {};
  for (const ruleId of Object.keys(debt).sort()) {
    const paths = {};
    for (const path of Object.keys(debt[ruleId]).sort()) if (debt[ruleId][path] > 0) paths[path] = debt[ruleId][path];
    if (Object.keys(paths).length) rules[ruleId] = paths;
  }
  return { version: BASELINE_VERSION, rules };
}

export async function readBaseline(path) {
  const parsed = JSON.parse(await readFile(path, "utf8"));
  if (parsed.version !== BASELINE_VERSION || typeof parsed.rules !== "object" || parsed.rules === null) {
    throw new Error(`Unsupported UI convergence baseline at ${path}. Expected version ${BASELINE_VERSION}.`);
  }
  return cleanBaseline(parsed.rules);
}

export async function writeBaseline(path, baseline) {
  await writeFile(path, `${JSON.stringify(cleanBaseline(baseline.rules), null, 2)}\n`, "utf8");
}

export async function auditWorkspace({ root = process.cwd(), roots = AUDIT_ROOTS, baseline, contracts = STORYBOOK_CONTRACTS } = {}) {
  const absoluteRoot = resolve(root);
  const files = (await Promise.all(roots.map((path) => filesBelow(join(absoluteRoot, path))))).flat();
  const sourceFiles = files.filter((file) => SOURCE_EXTENSIONS.has(extname(file)));
  const styleFiles = files.filter((file) => STYLE_EXTENSIONS.has(extname(file)));
  const allFiles = [...new Set([...sourceFiles, ...styleFiles])];
  const textByFile = new Map(await Promise.all(allFiles.map(async (file) => [file, await readFile(file, "utf8")])));
  const pathByFile = new Map(allFiles.map((file) => [file, relative(absoluteRoot, file).replaceAll("\\", "/")]));
  const ruleById = new Map(RULES.map((item) => [item.id, item]));
  const allDirectives = allFiles.flatMap((file) => exceptionDirectives(textByFile.get(file), pathByFile.get(file)));
  const directiveErrors = validateDirectives(allDirectives, ruleById);
  const eligibleDirectives = allDirectives.filter((directive) => directive.validSyntax && !directiveErrors.some((error) => error.path === directive.path && error.line === directive.line));
  const matches = {};

  for (const auditRule of RULES) {
    matches[auditRule.id] = {};
    const candidates = auditRule.files === "source" ? sourceFiles : auditRule.files === "style" ? styleFiles : allFiles;
    for (const file of candidates) {
      const path = pathByFile.get(file);
      if (auditRule.ignorePath?.(path) || (auditRule.appliesTo && !auditRule.appliesTo(path))) continue;
      const text = textByFile.get(file);
      const pattern = new RegExp(auditRule.pattern.source, auditRule.pattern.flags);
      for (const match of text.matchAll(pattern)) {
        if (auditRule.ignoreMatch?.({ text, index: match.index, match: match[0], path })) continue;
        const details = lineDetails(text, match.index);
        const exception = eligibleDirectives.find((directive) => !directive.used && directive.path === path && directive.targetLine === details.line && directive.ruleId === auditRule.id);
        if (exception) {
          exception.used = true;
          continue;
        }
        matches[auditRule.id][path] ??= [];
        matches[auditRule.id][path].push({ ...details, match: match[0] });
      }
    }
  }

  for (const directive of eligibleDirectives.filter((item) => !item.used)) {
    directiveErrors.push({ ...directive, message: `The exception does not suppress a ${directive.ruleId} finding on the immediately following line.` });
  }

  const currentDebt = {};
  for (const auditRule of RULES) {
    currentDebt[auditRule.id] = {};
    for (const [path, findings] of Object.entries(matches[auditRule.id])) currentDebt[auditRule.id][path] = findings.length;
  }
  const currentBaseline = cleanBaseline(currentDebt);
  const accepted = baseline?.rules ?? currentBaseline.rules;
  const increases = [];
  const reductions = [];
  for (const auditRule of RULES) {
    const paths = new Set([...Object.keys(accepted[auditRule.id] ?? {}), ...Object.keys(currentDebt[auditRule.id] ?? {})]);
    for (const path of [...paths].sort()) {
      const before = accepted[auditRule.id]?.[path] ?? 0;
      const now = currentDebt[auditRule.id]?.[path] ?? 0;
      if (now > before) increases.push({ rule: auditRule, path, before, now, findings: matches[auditRule.id]?.[path] ?? [] });
      if (now < before) reductions.push({ rule: auditRule, path, before, now });
    }
  }

  const coverageErrors = [];
  for (const contract of contracts) {
    let text;
    try {
      text = await readFile(join(absoluteRoot, contract.path), "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      coverageErrors.push({ contract, missing: [contract.path] });
      continue;
    }
    const missing = contract.required.filter((marker) => !text.includes(marker));
    if (missing.length) coverageErrors.push({ contract, missing });
  }

  const totals = Object.fromEntries(RULES.map((auditRule) => [auditRule.id, Object.values(currentDebt[auditRule.id] ?? {}).reduce((sum, count) => sum + count, 0)]));
  return { currentBaseline, totals, increases, reductions, directiveErrors, coverageErrors, exceptionCount: eligibleDirectives.filter((item) => item.used).length };
}

export function formatAuditReport(result) {
  const lines = ["Morrovia UI convergence enforcement"];
  lines.push(...Object.entries(result.totals).map(([id, count]) => `- ${id}: ${count} accepted debt occurrence${count === 1 ? "" : "s"}`));
  lines.push(`- documented local exceptions: ${result.exceptionCount}`);
  for (const item of result.increases) {
    const delta = item.now - item.before;
    lines.push("", `[ui-audit/${item.rule.id}] ${item.path} rose from ${item.before} to ${item.now} (+${delta}).`);
    for (const finding of item.findings.slice(0, Math.min(3, delta))) lines.push(`  ${item.path}:${finding.line}:${finding.column}  ${finding.excerpt}`);
    lines.push(`  Canonical alternative: ${item.rule.alternative}`);
    if (item.rule.allowException) lines.push(`  Narrow exception: add /* morrovia-ui-audit-allow-next-line ${item.rule.id} -- <specific reason> */ immediately above the one unavoidable occurrence.`);
  }
  for (const error of result.directiveErrors) lines.push("", `[ui-audit/exception] ${error.path}:${error.line} ${error.message}`);
  for (const error of result.coverageErrors) {
    lines.push("", `[ui-audit/${error.contract.id}] ${error.contract.path} is missing: ${error.missing.join(", ")}.`);
    lines.push(`  Required coverage: ${error.contract.alternative}`);
  }
  for (const item of result.reductions) {
    lines.push("", `[ui-audit/baseline-reduction] ${item.rule.id} in ${item.path} fell from ${item.before} to ${item.now}.`);
    lines.push("  Lower the checked-in baseline with: npm run audit:ui -- --accept-reductions");
  }
  return lines.join("\n");
}
