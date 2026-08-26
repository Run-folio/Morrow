import { runConstraintGauntlet } from "./harness.ts";

const summary = runConstraintGauntlet();
console.log("Constraint gauntlet".padEnd(54), "Gate".padEnd(8), "Outcome".padEnd(24), "Validator");
for (const result of summary.results) {
  console.log(
    result.name.padEnd(54),
    (result.builder.canBuildTrip ? "pass" : "blocked").padEnd(8),
    result.builder.outcome.padEnd(24),
    result.validator.issueCodes.join(", ") || "none",
  );
}
console.log(`\n${summary.caseCount} cases · ${summary.hardFailureCount} hard failures · ${summary.expectationFailures.length} expectation failures`);
if (summary.expectationFailures.length) {
  summary.expectationFailures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
