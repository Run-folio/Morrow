import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// Next can compile successfully while omitting a client boundary from its RSC
// manifest. Check the production page boundaries before accepting an artifact.
const root = fs.realpathSync(process.argv[2] ?? process.cwd());
const dist = process.argv[3] ?? process.env.NEXT_DIST_DIR ?? ".next";
const failures = [];
let boundariesChecked = 0;
const isClient = source => /^\s*["']use client["'];/.test(source);

function checkPage(file) {
  const source = fs.readFileSync(file, "utf8");
  const boundaries = isClient(source) ? [file] : [];
  for (const match of isClient(source) ? [] : source.matchAll(/import\s+\w+\s+from\s+["'](@\/[^"']+)["']/g)) {
    const imported = path.join(root, match[1].slice(2)) + ".tsx";
    if (fs.existsSync(imported) && isClient(fs.readFileSync(imported, "utf8"))) boundaries.push(imported);
  }
  if (!boundaries.length) return;
  const route = path.relative(path.join(root, "app"), file).replace(/\.tsx$/, "").split(path.sep).join("/");
  const manifestPath = path.join(root, dist, "server/app", route + "_client-reference-manifest.js");
  if (!fs.existsSync(manifestPath)) {
    failures.push({ route, error: "manifest missing" });
    return;
  }
  const context = {};
  vm.runInNewContext(fs.readFileSync(manifestPath, "utf8"), context);
  const manifest = context.__RSC_MANIFEST?.["/" + route];
  for (const boundary of boundaries) {
    boundariesChecked++;
    if (!manifest?.clientModules?.[boundary]) failures.push({ route, boundary, error: "client boundary omitted" });
  }
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name === "page.tsx") checkPage(file);
  }
}
walk(path.join(root, "app"));
console.log(JSON.stringify({ root, dist, boundariesChecked, failures }, null, 2));
if (failures.length) process.exitCode = 1;
