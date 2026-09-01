import { runOpenWorldEngineGauntlet } from "./harness.ts";

const summary = await runOpenWorldEngineGauntlet();
console.log(JSON.stringify(summary, null, 2));
if (summary.results.some((result) => !result.correct)) process.exitCode = 1;

