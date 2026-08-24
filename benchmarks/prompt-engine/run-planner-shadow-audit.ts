import { readFileSync } from "node:fs";
import { createGroqPlannerReviewProvider } from "../../lib/easyt/groq-planner-review.ts";
import { runPlannerShadowAudit } from "./planner-shadow-audit.ts";

function configuredKey() {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  try {
    const row = readFileSync(".env.local", "utf8").split(/\r?\n/).find((line) => line.startsWith("GROQ_API_KEY="));
    return row?.slice("GROQ_API_KEY=".length).trim() || undefined;
  } catch { return undefined; }
}

if (process.env.MORROVIA_PLANNER_SHADOW_AUDIT !== "live") {
  throw new Error("Set MORROVIA_PLANNER_SHADOW_AUDIT=live to run the bounded live planner-shadow audit.");
}
const apiKey = configuredKey();
if (!apiKey) throw new Error("GROQ_API_KEY is required for the live planner-shadow audit.");
const report = await runPlannerShadowAudit({ provider: createGroqPlannerReviewProvider(apiKey), mode: "live" });
console.log(JSON.stringify(report, null, 2));
