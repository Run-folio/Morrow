import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const checker = path.resolve("scripts/check-client-reference-manifests.mjs");
test("hosting and check builds share the client reference manifest gate", () => {
  const { scripts } = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assert.equal(scripts.build, "next build && node scripts/check-client-reference-manifests.mjs");
  assert.equal(scripts["build:check"], "NEXT_DIST_DIR=.next-check npm run build");
});
for (const dist of [".next", ".next-check", ".custom-output"]) {
  test(`manifest gate checks ${dist}, rejects omission and accepts numeric module zero`, () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "b15-manifest-gate-")));
    try {
      fs.mkdirSync(path.join(root, "app/control"), { recursive: true });
      const boundary = path.join(root, "app/control/page.tsx");
      fs.writeFileSync(boundary, '"use client"; export default function Page() {}');
      const manifest = path.join(root, dist, "server/app/control/page_client-reference-manifest.js");
      fs.mkdirSync(path.dirname(manifest), { recursive: true });
      // Remove the variable rather than supplying an empty output path.
      const invoke = () => {
        const env = { ...process.env }; delete env.NEXT_DIST_DIR;
        if (dist !== ".next") env.NEXT_DIST_DIR = dist;
        return spawnSync(process.execPath, [checker, root], { encoding: "utf8", env });
      };
      fs.writeFileSync(manifest, 'globalThis.__RSC_MANIFEST={"/control/page":{clientModules:{}}};');
      const omitted = invoke(); assert.equal(omitted.status, 1); assert.match(omitted.stdout, /client boundary omitted/);
      fs.writeFileSync(manifest, `globalThis.__RSC_MANIFEST={"/control/page":{clientModules:{${JSON.stringify(boundary)}:{id:0}}}};`);
      const valid = invoke(); assert.equal(valid.status, 0, valid.stderr); assert.equal(JSON.parse(valid.stdout).dist, dist);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}
