import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function record(area: string, width = 1440, elapsedMs = 3000) {
  return { area, scope: 'multi-area-discovery-acceptance', width, type: width === 1440 ? 'return_to_start' : 'one_way',
    elapsedMs, driverMs: elapsedMs + 20, thresholdMs: 2500, thresholdPassed: elapsedMs < 2500,
    functionalTimeoutMs: 15000, functionalStatus: 'passed' };
}
function runSummary(records = [record('South Korea'), record('Africa')], width = 1440, log = '# pass 1\n# fail 0\n# cancelled 0\n', branch = 'main') {
  const dir = mkdtempSync(join(tmpdir(), 'morrovia-acceptance-summary-'));
  const logPath = join(dir, 'run.log');
  writeFileSync(logPath, log);
  for (const report of records) writeFileSync(join(dir, `acceptance-${report.area.toLowerCase().replaceAll(' ', '-')}-${report.width}.json`), JSON.stringify(report));
  const run = spawnSync(process.execPath, [new URL('../scripts/staging-qualification-summary.mjs', import.meta.url).pathname,
    width === 1440 ? 'multi-desktop' : 'multi-mobile', logPath, dir], {
    encoding: 'utf8', env: { ...process.env, GITHUB_REF_NAME: branch, GITHUB_STEP_SUMMARY: join(dir, 'step-summary.md') },
  });
  return { ...run, dir };
}
for (const branch of ['main', 'staging', 'codex/other', '']) for (const width of [1440, 390]) {
  test(`${branch || 'local'} ${width}px keeps performance failures visible after functional qualification`, () => {
    const run = runSummary([record('South Korea', width, 3171.7), record('Africa', width, 6869.5)], width, undefined, branch);
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(readFileSync(join(run.dir, 'qualification.json'), 'utf8'));
    assert.equal(result.classification, 'functional-gates-pass-with-performance-failures');
    assert.equal(result.functionalStatus, 'passed');
    assert.equal(result.performanceStatus, 'failed');
    assert.equal(result.performanceTargetMs, 2500);
    assert.deepEqual(result.performanceFailures.map((report: { elapsedMs: number }) => report.elapsedMs), [3171.7, 6869.5]);
    assert.equal(result.acceptancePerformance.length, 2);
    assert.match(run.stdout, /::warning title=Discovery acceptance performance failure/);
    const summary = readFileSync(join(run.dir, 'step-summary.md'), 'utf8');
    assert.match(summary, /PERFORMANCE FAILURE/);
    assert.doesNotMatch(summary, /staging only|staging-only/i);
  });
}
test('clean performance requires both completed area measurements below 2500ms', () => {
  const run = runSummary([record('South Korea', 1440, 2499.9), record('Africa', 1440, 2400)]);
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(readFileSync(join(run.dir, 'qualification.json'), 'utf8'));
  assert.equal(result.classification, 'pass');
  assert.equal(result.performanceStatus, 'passed');
  assert.deepEqual(result.performanceFailures, []);
  assert.equal(result.acceptancePerformance.length, 2);
});
const invalidRecords: [string, ReturnType<typeof record>[]][] = [
  ['no records', []], ['missing Africa', [record('South Korea')]],
  ['pending recovery', [{ ...record('South Korea'), functionalStatus: 'pending' }, record('Africa')]],
  ['failed recovery', [{ ...record('South Korea'), functionalStatus: 'failed' }, record('Africa')]],
  ['raised target', [{ ...record('South Korea'), thresholdMs: 3000 }, record('Africa')]],
  ['concealed miss', [{ ...record('South Korea'), thresholdPassed: true }, record('Africa')]],
  ['concealed pass', [{ ...record('South Korea', 1440, 2400), thresholdPassed: false }, record('Africa')]],
  ['invalid elapsed', [{ ...record('South Korea'), elapsedMs: null as unknown as number }, record('Africa')]],
  ['invalid driver elapsed', [{ ...record('South Korea'), driverMs: -1 }, record('Africa')]],
  ['wrong trip type', [{ ...record('South Korea'), type: 'one_way' }, record('Africa')]],
  ['wrong width', [record('South Korea', 390), record('Africa')]],
  ['raised completion bound', [{ ...record('South Korea'), functionalTimeoutMs: 30000 }, record('Africa')]],
  ['completion beyond bound', [record('South Korea', 1440, 15000), record('Africa')]],
  ['wrong scope', [{ ...record('South Korea'), scope: 'staging-only-known-South Korea-acceptance-failure' }, record('Africa')]],
  ['extra unreviewed record', [record('South Korea'), record('Africa'), record('Japan')]],
];
for (const [label, reports] of invalidRecords) test(`qualification rejects ${label}`, () => {
  const run = runSummary(reports);
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stderr, /Invalid\/incomplete acceptance-performance/);
});
for (const [name, log] of [
  ['failed case', '# pass 1\n# fail 1\n# cancelled 0\n'],
  ['cancelled case', '# pass 1\n# fail 0\n# cancelled 1\n'],
  ['missing case', '# pass 0\n# fail 0\n# cancelled 0\n'],
] as const) test(`functional ${name} still blocks qualification`, () => {
  const run = runSummary(undefined, 1440, log);
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stderr, /Incomplete or failed multi-desktop qualification/);
});
