import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const generatedDirectories = [".next", ".next-dev", ".next-check"];

function removeGeneratedTypes() {
  for (const directory of generatedDirectories) rmSync(directory, { force: true, recursive: true });
  rmSync("tsconfig.tsbuildinfo", { force: true });
}

function run(script) {
  execFileSync(npm, ["run", script], { stdio: "inherit" });
}

removeGeneratedTypes();
run("audit:ui");
run("test:ui-convergence");
run("typecheck");

// Type roots from another Next invocation must never affect the release
// typecheck. The duplicate alias makes accidental inclusion fail.
for (const directory of [".next-dev", ".next-check"]) {
  mkdirSync(`${directory}/types`, { recursive: true });
  writeFileSync(
    `${directory}/types/stale-release-gate.d.ts`,
    "type MorroviaStaleTypeRoot = true;\ntype MorroviaStaleTypeRoot = false;\n",
  );
}
try {
  run("typecheck");
} finally {
  for (const directory of [".next-dev", ".next-check"]) rmSync(directory, { force: true, recursive: true });
}

run("test:prompt-engine");
run("test:planner-shadow");
run("test:builder-gate");
run("build");
