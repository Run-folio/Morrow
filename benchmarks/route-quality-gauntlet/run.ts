import { runRouteQualityGauntlet } from "./harness.ts";

const summary = runRouteQualityGauntlet();
console.log(JSON.stringify({
  version: summary.version,
  fixtureCount: summary.fixtureCount,
  adversarialVariantCount: summary.adversarialVariantCount,
  measurements: summary.measurements,
  failedFindings: summary.failedFindings,
  comparisonFailures: summary.comparisonFailures,
  results: summary.results.map((item) => ({ id: item.id, output: item.output, assessment: item.assessment })),
  comparisons: summary.comparisons,
}, null, 2));
