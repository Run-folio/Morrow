import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// Independently pinned to the 15 reviewed cases in the successful Transport CI run.
const cases = [
  'transport fixture owns canonical geography; coordinates without identity remain unverified',
  'Transport modal keeps choices as drafts until Apply and restores the recommendation after reload',
  'Builder changes the same canonical leg choice and projects its effective time after reload',
  'Transport keeps selected journey, card and map leg synchronized at desktop and mobile widths',
  'manual booking marks and optional details survive guest save, reload, edit and explicit undo',
  'routed road evidence stays a separate reference across Builder and Transport at narrow and desktop widths',
  'Transport deep link selects canonical leg, marks the review set, and follows browser history',
  'Overview Review transfers opens Transport on the affected canonical leg',
  'Transport selection keeps repeated place occurrences distinct by canonical leg ID',
  'Transport leaves the chronological list usable when the map provider is unavailable',
  'Transport hides Omio link-outs for unknown modes and missing or past leg dates',
  'Transport builds a guarded route-specific Omio flight handoff from canonical route and date',
  'Transport builds a guarded route-specific Omio train handoff for the verified Paris to Berlin route',
  'Omio click-out opens a separate tab and returning or reloading leaves canonical trip state unchanged',
  'applying a different mode keeps a traveller booking as a visible mismatch without reassigning its details',
];

function tap(names = cases) {
  return 'TAP version 13\n' + names.map((name, i) => `# Subtest: ${name}\nok ${i + 1} - ${name}\n`).join('')
    + `1..${names.length}\n# tests ${names.length}\n# suites 0\n# pass ${names.length}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1234\n`;
}

function runSummary(log: string, group = 'transport') {
  // Preserve test artifacts for review; never remove user files or prior evidence.
  const dir = mkdtempSync(join(tmpdir(), 'morrovia-qualification-summary-'));
  const logPath = join(dir, 'run.log');
  writeFileSync(logPath, log);
  const run = spawnSync(process.execPath, [new URL('../scripts/staging-qualification-summary.mjs', import.meta.url).pathname, group, logPath, dir], {
    encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: join(dir, 'step-summary.md'), COMMIT_REF: 'synthetic-review-sha' },
  });
  return { ...run, dir };
}

test('Transport qualification accepts the complete reviewed test set and records its names', () => {
  const run = runSummary(tap());
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(readFileSync(join(run.dir, 'qualification.json'), 'utf8'));
  assert.equal(result.expected, 15);
  assert.equal(result.nonwaivedCasesPassed, 15);
  assert.deepEqual(result.verifiedCases, cases);
  assert.equal(result.nonwaivedFailures, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.cancelled, 0);
  assert.equal(result.todo, 0);
  assert.equal(result.commit, 'synthetic-review-sha');
});

test('Transport qualification handles ANSI-colored TAP without weakening the case contract', () => {
  const run = runSummary(tap().replace(/^ok /gm, '\u001b[32mok\u001b[0m '));
  assert.equal(run.status, 0, run.stderr);
});

const invalidLogs: [string, string][] = [
  ['old nine-case count with unrelated tests', tap(Array.from({ length: 9 }, (_, i) => `unrelated ${i}`))],
  ['same count with a required case replaced', tap([...cases.slice(0, -1), 'unrelated replacement'])],
  ['duplicate case replacing a required case', tap([...cases.slice(0, -1), cases[0]!])],
  ['missing case', tap(cases.slice(0, -1))],
  ['unexpected extra case', tap([...cases, 'unexpected extra'])],
  ['failure counter', tap().replace('# fail 0', '# fail 1')],
  ['cancelled counter', tap().replace('# cancelled 0', '# cancelled 1')],
  ['skipped counter', tap().replace('# skipped 0', '# skipped 1')],
  ['todo counter', tap().replace('# todo 0', '# todo 1')],
  ['failure result concealed by pass counters', tap().replace('ok 1 -', 'not ok 1 -')],
  ['skipped case concealed by counters', tap().replace(`ok 1 - ${cases[0]}`, `ok 1 - ${cases[0]} # SKIP disabled`)],
  ['todo case concealed by counters', tap().replace(`ok 1 - ${cases[0]}`, `ok 1 - ${cases[0]} # TODO pending`)],
  ['duplicate result number', tap().replace('ok 2 -', 'ok 1 -')],
  ['incomplete plan', tap().replace('1..15', '1..14')],
  ['missing plan', tap().replace('1..15\n', '')],
  ['missing counters', tap().replace('# skipped 0\n', '')],
  ['duplicate summary', tap() + '# pass 15\n'],
  ['duplicate complete run', tap() + tap()],
  ['inconsistent tests count', tap().replace('# tests 15', '# tests 16')],
  ['truncated run with fabricated complete counts', tap().replace(`# Subtest: ${cases[14]}\nok 15 - ${cases[14]}\n`, '')],
  ['extra nameless failure', tap() + 'not ok 16\n'],
  ['truncated extra result', tap() + 'ok 16 -\n'],
  ['extra nameless pass', tap() + 'ok 16\n'],
  ['bailout after complete counts', tap() + 'Bail out! interrupted runner\n'],
];
for (const [name, log] of invalidLogs) test(`Transport qualification rejects ${name}`, () => {
  const run = runSummary(log);
  assert.equal(run.status, 1, `Unexpected success for ${name}: ${run.stdout}`);
  assert.match(run.stderr, /(?:Incomplete|Missing|Duplicate|Invalid).*transport/i);
});

test('unrelated partition still uses its unchanged count contract', () => {
  const run = runSummary('ℹ pass 14\nℹ fail 0\nℹ cancelled 0\n', 'core');
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(readFileSync(join(run.dir, 'qualification.json'), 'utf8'));
  assert.equal(result.expected, 14);
  assert.equal(result.classification, 'pass');
});
