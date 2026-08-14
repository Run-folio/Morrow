/**
 * Creates the small, deployable subset used by Passport to Destination.
 * Usage:
 *   node --experimental-strip-types scripts/import-passport-index.ts /path/to/passport-index.json
 *
 * Source: github.com/imorte/passport-index-data (MIT). Keep its LICENSE beside
 * the generated file and update `sourceUpdatedAt` from the upstream README.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { entrySourcesByCountry } from "../lib/easyt/travel-readiness.ts";

const passports = [
  "Australia", "Canada", "Denmark", "Finland", "France", "Germany", "Ireland", "Japan", "Netherlands",
  "New Zealand", "Norway", "Singapore", "South Korea", "Spain", "Sweden", "United Kingdom", "United States",
];

type SourceRule = { status: string; days?: number };
type SourceMatrix = Record<string, Record<string, SourceRule>>;
type Output = {
  source: string;
  sourceUpdatedAt: string;
  importedAt: string;
  rules: Record<string, Record<string, SourceRule>>;
};

const aliases: Record<string, string> = { Turkey: "Türkiye" };
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

const isoByName = (matrix: SourceMatrix) => {
  const names = new Map<string, string>();
  for (const code of Object.keys(matrix)) names.set(regionNames.of(code.toUpperCase()) ?? code, code);
  return names;
};

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Pass the extracted passport-index.json file path.");

const matrix = JSON.parse(readFileSync(resolve(sourcePath), "utf8")) as SourceMatrix;
const codes = isoByName(matrix);
const codeFor = (name: string) => codes.get(aliases[name] ?? name);
const destinations = Object.keys(entrySourcesByCountry);
const rules: Output["rules"] = {};

for (const passport of passports) {
  const passportCode = codeFor(passport);
  if (!passportCode || !matrix[passportCode]) throw new Error(`Passport code not found for ${passport}`);
  rules[passport] = {};
  for (const destination of destinations) {
    const destinationCode = codeFor(destination);
    const rule = destinationCode ? matrix[passportCode][destinationCode] : undefined;
    if (rule) rules[passport][destination] = rule;
  }
}

const output: Output = {
  source: "https://github.com/imorte/passport-index-data",
  sourceUpdatedAt: "2026-02-17",
  importedAt: new Date().toISOString().slice(0, 10),
  rules,
};
const destinationPath = resolve("lib/easyt/data/passport-index-visa-matrix.json");
mkdirSync(dirname(destinationPath), { recursive: true });
writeFileSync(destinationPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${Object.values(rules).reduce((total, set) => total + Object.keys(set).length, 0)} rules to ${destinationPath}`);
