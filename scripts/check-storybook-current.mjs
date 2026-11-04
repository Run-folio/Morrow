import { chromium } from 'playwright';
import { requireStorySelection, requireWorkspaceNavigation, selectStoryBatch, requireResumeWitness } from './storybook-current-contract.mjs';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const argumentsMap = Object.fromEntries(process.argv.slice(2).map(value => { const [key, ...rest] = value.replace(/^--/, '').split('='); return [key, rest.join('=') || true]; }));
const base = new URL(String(argumentsMap.url || 'http://127.0.0.1:64314'));
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Storybook qualification requires an isolated local preview');
const output = resolve(String(argumentsMap.output || 'output/playwright/storybook-current-ui'));
const all = argumentsMap['smoke-all'] === true;
const memoryOnly = argumentsMap['memory-only'] === true;
await mkdir(output, { recursive: true });
const response = await fetch(new URL('/index.json', base));
if (!response.ok) throw new Error(`Storybook index returned ${response.status}`);
const indexRaw = await response.text(), entries = Object.values(JSON.parse(indexRaw).entries).filter(entry => entry.type === 'story');
const manual = entries.filter(entry => entry.tags?.includes('manual-integration'));
const selected = [];
const add = (entry, width, height = 900, strict = false) => { if (entry && !selected.some(test => test.id === entry.id && test.width === width && test.height === height)) selected.push({ ...entry, width, height, strict }); };
if (all) for (const entry of entries) { if (!manual.includes(entry)) add(entry, /Mobile|390|320|430|Small/.test(entry.name) ? 390 : 1440); }
else {
  for (const entry of entries.filter(item => item.tags?.includes('current-ui'))) {
    const mobileOnly = /trip-shell\.stories/.test(entry.importPath);
    add(entry, 390, 844, true);
    if (!mobileOnly) add(entry, 1440, 900, true);
  }
  const representative = [
    ['immersive-home.stories.tsx', 'Full Composition'], ['immersive-home.stories.tsx', 'Describe Mode'],
    ['product-demo.stories.tsx', 'Preview Desktop 1440'],
    ['dashboard-client.stories.tsx', 'Active Trips'], ['dashboard-client.stories.tsx', 'Zero Trips'],
    ['trip-overview-workspace.stories.tsx', 'Active Planning'], ['trip-itinerary-workspace.stories.tsx', 'Calendar'],
    ['trip-map-workspace.stories.tsx', 'Active Planning'], ['trip-transport-workspace.stories.tsx', 'Canonical Agenda'],
    ['trip-explore-workspace.stories.tsx', 'All Trip For You'], ['trip-stay-workspace.stories.tsx', 'Tokyo Three Night Stay'],
  ];
  for (const [file, name] of representative) {
    const entry = entries.find(item => item.importPath.endsWith(file) && item.name === name);
    if (!entry) throw new Error(`Coverage selection missing ${file}: ${name}`);
    for (const width of [320, 390, 430, 768, 1440]) add(entry, width);
  }
  add(entries.find(item => item.id.endsWith('--mobile-metadata-390')), 320, 640, true);
  add(entries.find(item => item.id.endsWith('--calendar') && item.importPath.endsWith('trip-itinerary-workspace.stories.tsx')), 844, 390);
}
selected.splice(0, selected.length, ...requireStorySelection(selected, entries, { ids: argumentsMap.ids, memoryOnly }));
const eligibleCases = selected.length;
const batchOffset = argumentsMap.offset ?? 0;
const batchLimit = argumentsMap.limit ?? (all ? 100 : selected.length);
selected.splice(0, selected.length, ...selectStoryBatch(selected, { offset: batchOffset, limit: batchLimit }));
const indexSha256 = createHash('sha256').update(indexRaw).digest('hex');
const iframeRaw = await (await fetch(new URL('/iframe.html', base))).text();
const buildFingerprint = createHash('sha256').update(indexRaw + iframeRaw).digest('hex');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const caseKey = item => `${item.id}:${item.width}:${item.height}`;
const workers = Number(argumentsMap.workers ?? 2);
if (!Number.isInteger(workers) || workers < 1 || workers > 3) throw new Error('Workers must be 1–3');
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const mode = memoryOnly ? 'memory-only-fixtures' : all ? 'catalogue-smoke' : 'core-responsive-interaction-a11y';
const qualification = { mode, all, memoryOnly, cases: selected.map(({ id, width, height, strict }) => ({ id, width, height, strict })), runnerSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).update(await readFile(new URL('./storybook-current-contract.mjs', import.meta.url))).digest('hex') };
const results = [];
if (argumentsMap.resume) {
  const prior = JSON.parse(await readFile(join(output, 'results.json'), 'utf8'));
  requireResumeWitness(prior, { qualification, indexSha256, buildFingerprint, sourceCommit, caseKeys: selected.map(caseKey) });
  results.push(...prior.results);
}
let checkpoint = Promise.resolve();
const writeResults = () => {
  const snapshot = JSON.stringify({ checkedAt: new Date().toISOString(), base: base.href, mode, qualification, sourceCommit, buildFingerprint, indexSha256, indexedStories: entries.length, excludedManual: manual.map(item => item.id), eligibleCases, batchOffset: Number(batchOffset), scheduledCases: selected.length, caseKeys: selected.map(caseKey), results }, null, 2);
  checkpoint = checkpoint.then(async () => { await writeFile(join(output, 'results.tmp'), snapshot); await rename(join(output, 'results.tmp'), join(output, 'results.json')); });
  return checkpoint;
};
const completed = new Set(results.map(caseKey));
const pending = selected.filter(item => !completed.has(caseKey(item)));

const browser = await chromium.launch({ headless: true });
try {
  let next = 0;
  async function worker() {
    while (next < pending.length) {
      const test = pending[next++], context = await browser.newContext({ viewport: { width: test.width, height: test.height }, reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [], requests = new Set();
      page.on('pageerror', error => errors.push(error.message));
      if (memoryOnly) await context.addInitScript(() => {
        const storage = () => { const values = new Map(); return { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, String(value)); }, removeItem: key => values.delete(key), clear: () => values.clear() }; };
        Object.defineProperty(window, 'localStorage', { configurable: true, value: storage() });
        Object.defineProperty(window, 'sessionStorage', { configurable: true, value: storage() });
        Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('Native storage excluded from this qualification', 'SecurityError'); } });
      });
      await context.addInitScript(() => {
        window.__storybookCheck = { finished: null, errors: [], reporters: [] };
        addEventListener('message', event => {
          let data = event.data;
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
          if (data?.key !== 'storybook-channel') return;
          if (data.event?.type === 'storyFinished') {
            const finished = data.event.args?.[0];
            window.__storybookCheck.finished = finished?.status;
            window.__storybookCheck.reporters = (finished?.reporters || []).map(reporter => ({ type: reporter.type, status: reporter.status, violations: (reporter.result?.violations || []).map(item => ({ id: item.id, impact: item.impact, description: item.description, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })) }));
          }
          if (['storyErrored', 'storyThrewException', 'playFunctionThrewException'].includes(data.event?.type)) window.__storybookCheck.errors.push(JSON.stringify(data.event.args).slice(0, 1800));
        });
      });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/__storybook_current_check__') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>Storybook check</title><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;display:block}</style><iframe title="Story under test" src="/iframe.html?id=${test.id}&viewMode=story"></iframe>` });
        if (url.origin !== base.origin || url.pathname.startsWith('/api/')) { requests.add(url.origin === base.origin ? url.pathname : url.hostname); return route.abort(); }
        return route.continue();
      });
      let runtimeFailure = null, finished = null, violations = [], screenshot = null, keyboard = null;
      try {
        await page.goto(new URL('/__storybook_current_check__', base).href, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__storybookCheck.finished !== null || window.__storybookCheck.errors.length > 0, null, { timeout: 25000 });
        const state = await page.evaluate(() => window.__storybookCheck);
        finished = state.finished;
        violations = state.reporters.filter(reporter => reporter.type === 'a11y').flatMap(reporter => reporter.violations);
        const onlyAccessibility = state.reporters.some(reporter => reporter.type === 'a11y' && reporter.status === 'failed') && !state.reporters.some(reporter => reporter.type !== 'a11y' && reporter.status === 'failed');
        if (state.errors.length || errors.length || finished !== 'success' && !onlyAccessibility) throw new Error(JSON.stringify({ finished, errors, channel: state.errors }));
        const frame = page.frames().find(frame => frame.url().includes('/iframe.html'));
        if (!frame || !await frame.locator('#storybook-root').evaluate(node => node.childElementCount > 0)) throw new Error('Story rendered no content');
        if (!all) {
          const surface = test.importPath.match(/trip-(overview|itinerary|transport|explore|stay)-workspace\.stories/);
          const navigation = frame.getByRole('navigation', { name: 'Trip workspace' });
          if (surface) {
            const count = await navigation.count();
            const current = navigation.locator('a[aria-current="page"]');
            const more = navigation.getByRole('button', { name: /^More/ });
            requireWorkspaceNavigation(surface[1], test.width, {
              count,
              current: count && await current.count() ? await current.first().innerText() : null,
              more: count && await more.count() ? await more.first().getAttribute('aria-label') : null,
            });
          }
          await frame.addScriptTag({ path: axePath });
          const audit = await frame.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
          const independentlyFound = audit.violations.map(item => ({ id: item.id, impact: item.impact, description: item.description, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
          violations = [...new Map([...violations, ...independentlyFound].map(item => [item.id, item])).values()];
          screenshot = `${test.id}-${test.width}x${test.height}.png`;
          await page.screenshot({ path: join(output, screenshot) });
          if (/--mobile-more-open$|--mobile-trip-details$/.test(test.id)) {
            const dialog = frame.locator("dialog[open]");
            if (await dialog.count()) {
              await page.keyboard.press("Escape");
              await dialog.waitFor({ state: "hidden", timeout: 3000 });
              keyboard = await frame.evaluate(() => ({ nativeEscapeClosed: !document.querySelector("dialog[open]"), returnFocus: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim().slice(0, 80) || document.activeElement?.tagName }));
            }
          }
        }
      } catch (error) { runtimeFailure = error.message.slice(0, 3500); }
      const row = { id: test.id, title: test.title, name: test.name, width: test.width, height: test.height, strict: test.strict, play: test.tags?.includes('play-fn') || false, finished, runtimeFailure, errors, violations, screenshot, keyboard, blockedRequests: [...requests], passed: !runtimeFailure && (!test.strict || violations.length === 0) };
      results.push(row); await context.close(); await writeResults();
      if (!row.passed || results.length % 20 === 0) console.log(`${results.length}/${selected.length} ${row.passed ? 'PASS' : 'FAIL'} ${test.id} ${test.width}: ${runtimeFailure || `${violations.length} accessibility findings`}`);
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));
} finally { await browser.close(); await writeResults(); }
const summary = { cases: results.length, runtimeFailures: results.filter(row => row.runtimeFailure).length, strictAccessibilityFailures: results.filter(row => row.strict && row.violations.length).length, legacyAccessibilityCases: results.filter(row => !row.strict && row.violations.length).length, manualExcluded: manual.length };
console.log(JSON.stringify(summary));
if (summary.runtimeFailures || summary.strictAccessibilityFailures) process.exitCode = 1;
