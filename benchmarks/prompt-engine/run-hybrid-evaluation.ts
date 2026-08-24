import { readFileSync } from "node:fs";
import { createGroqPlannerReviewProvider } from "../../lib/easyt/groq-planner-review.ts";
import { runHybridEvaluation } from "./hybrid-evaluation.ts";
import { PROMPT_ENGINE_CASES } from "./fixtures.ts";

const mode = process.env.MORROVIA_HYBRID_EVAL_MODE === "live" ? "live" : process.env.MORROVIA_HYBRID_EVAL_MODE === "record" ? "record" : "replay";
const key = process.env.GROQ_API_KEY ?? (() => { try { return readFileSync(".env.local", "utf8").split(/\r?\n/).find((line) => line.startsWith("GROQ_API_KEY="))?.slice(13).trim(); } catch { return undefined; } })();
if (mode !== "replay" && !key) throw new Error(`${mode} mode requires GROQ_API_KEY.`);
if (mode === "record" && process.env.MORROVIA_HYBRID_EVAL_RECORD_APPROVED !== "yes") throw new Error("Record mode requires MORROVIA_HYBRID_EVAL_RECORD_APPROVED=yes.");
const requestedRuns = Number(process.env.MORROVIA_HYBRID_EVAL_RUNS ?? "1");
if (!Number.isInteger(requestedRuns) || requestedRuns < 1 || requestedRuns > 2) throw new Error("MORROVIA_HYBRID_EVAL_RUNS must be 1 or 2.");
if (requestedRuns === 2 && process.env.MORROVIA_HYBRID_EVAL_MEASURE_NONDETERMINISM !== "yes") throw new Error("Two live runs require MORROVIA_HYBRID_EVAL_MEASURE_NONDETERMINISM=yes.");
const smoke = process.env.MORROVIA_HYBRID_EVAL_SMOKE === "yes";
const reports = [];
for (let run = 0; run < requestedRuns; run += 1) reports.push(await runHybridEvaluation({ mode, ...(mode === "replay" ? {} : { provider: createGroqPlannerReviewProvider(key!) }), recordApproval: mode === "record", ...(smoke ? { cases: PROMPT_ENGINE_CASES.slice(0, 1) } : {}) }));
console.log(JSON.stringify(requestedRuns === 1 ? reports[0] : { runs: reports }, null, 2));
