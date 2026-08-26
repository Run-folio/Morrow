import { runRealismGauntlet } from "./harness.ts";

const summary = runRealismGauntlet();
console.log(JSON.stringify(summary, null, 2));
if (summary.hardFailureCount) process.exitCode = 1;
