import { runUncertaintyGauntlet } from "./harness.ts";

const summary = await runUncertaintyGauntlet();
console.log(JSON.stringify(summary, null, 2));
if (summary.hardFailureCount) process.exitCode = 1;
