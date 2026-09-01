import { resolve } from "node:path";
import {
  auditWorkspace,
  DEFAULT_BASELINE_PATH,
  formatAuditReport,
  readBaseline,
  writeBaseline,
} from "./ui-convergence-audit-lib.mjs";

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const root = resolve(valueAfter("--root") ?? process.cwd());
const baselinePath = resolve(root, valueAfter("--baseline") ?? DEFAULT_BASELINE_PATH);
const acceptReductions = process.argv.includes("--accept-reductions");
const strict = process.argv.includes("--strict");

const baseline = await readBaseline(baselinePath);
const result = await auditWorkspace({ root, baseline });
console.log(formatAuditReport(result));

const hardFailures = result.increases.length + result.directiveErrors.length + result.coverageErrors.length;
if (acceptReductions) {
  if (hardFailures) {
    console.error("Refusing to update the UI baseline because new violations exist. Baseline updates can only reduce accepted debt.");
    process.exitCode = 1;
  } else if (result.reductions.length) {
    await writeBaseline(baselinePath, result.currentBaseline);
    console.log(`Lowered UI convergence baseline at ${baselinePath}.`);
  } else {
    console.log("UI convergence baseline is already current; no file was rewritten.");
  }
} else if (strict && (hardFailures || result.reductions.length)) {
  process.exitCode = 1;
}
