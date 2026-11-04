import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { openSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const enabled = process.env.MORROVIA_STAMPS_BROWSER_TESTS === '1';
const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = process.env.MORROVIA_STAMPS_EVIDENCE_DIR ?? fileURLToPath(new URL('../../', import.meta.url));
const fixture = evidence + '/stamps-fixture';
const screenshots = evidence + '/screenshots';

// Only the actual Stamps presentation is bundled. No Next app build, auth,
// persistence owner, analytics client or provider service runs in this fixture.
const entry = `
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {StampedExperience} from '${root}app/journey/stamped/stamped-client';
import '${root}app/journey/journey-design.css';
const query=new URLSearchParams(location.search),seed=query.has('empty')?{}:{algeria:'visited','united-states':'visited',china:'visited','united-kingdom':'visited',australia:'visited',france:'visited',brazil:'want',japan:'want'};
function Fixture(){
const[statuses,setStatuses]=useState(seed),[pending,setPending]=useState([]),[error,setError]=useState(null),[memories,setMemories]=useState({france:'Synthetic saved memory.'}),[photos,setPhotos]=useState({});
const control=useRef({calls:[],mode:'normal',complete:null});
useEffect(()=>{window.__stampsFixture=control.current},[]);
const changeStatus=async(countryId,status,source)=>{
  const state=control.current;state.calls.push({countryId,status,source});setError(null);
  const commit=()=>setStatuses(current=>{const next={...current};if(status)next[countryId]=status;else delete next[countryId];return next});
  if(state.mode==='pending'){setPending([countryId]);await new Promise(resolve=>{state.complete=()=>{commit();setPending([]);resolve()}})}
  else if(state.mode==='error'){setError({countryId,message:'Synthetic change was not saved. Previous status retained.'})}
  else commit();
};
return <main><StampedExperience authenticated={!query.has('guest')} language={query.get('lang')==='es'?'es':'en'} statuses={statuses} memories={query.has('empty')?{}:memories} photos={photos} pendingStatusIds={pending} statusError={error} ready={!query.has('loading')} initialSelectedCountryId={query.get('selected')} onStatusChange={changeStatus} onMemorySave={async(id,note,photo)=>{setMemories(current=>({...current,[id]:note}));setPhotos(current=>({...current,[id]:photo}));return true}} /></main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;

async function prepare() {
  await mkdir(fixture, { recursive: true }); await mkdir(screenshots, { recursive: true });
  await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: root }, outfile: fixture + '/app.js', bundle: true,
    platform: 'browser', format: 'iife', jsx: 'automatic', minify: false, sourcemap: false,
    define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.module.css': 'local-css' },
    plugins: [{ name: 'offline-stamps-only', setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'synthetic' }));
      builder.onResolve({ filter: /lib\/analytics$/ }, () => ({ path: 'analytics', namespace: 'synthetic' }));
      builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, args => ({ contents: args.path === 'analytics'
        ? 'export const trackEvent=()=>{}'
        : "import React from 'react';export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>}", loader: 'tsx', resolveDir: root }));
    } }], logLevel: 'silent',
  });
  await writeFile(fixture + '/index.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stamps · synthetic local component fixture</title><link rel="stylesheet" href="/app.css"><style>*{box-sizing:border-box}body{margin:0;background:var(--morrovia-paper);color:var(--morrovia-ink);font-family:var(--morrovia-ui)}button,input,select,textarea{font:inherit}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  await writeFile(fixture + '/server.cjs', `const http=require('node:http'),fs=require('node:fs'),path=require('node:path');const root=__dirname;const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://127.0.0.1').pathname;const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/app.css':'app.css'};if(!['GET','HEAD'].includes(req.method)||!files[name]){res.writeHead(404);res.end();return}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'");if(req.method==='HEAD'){res.end();return}fs.createReadStream(path.join(root,files[name])).pipe(res)});server.listen(0,'127.0.0.1',()=>{const ready={pid:process.pid,url:'http://127.0.0.1:'+server.address().port};fs.writeFileSync(path.join(root,'ready.json'),JSON.stringify(ready));console.log(ready.url)});`);
  // Reuse only this fixture's known loopback preview on subsequent runs.
  try {
    const ready = JSON.parse(await readFile(fixture + '/ready.json', 'utf8'));
    if (new URL(ready.url).hostname === '127.0.0.1' && (await fetch(ready.url, { method: 'HEAD' })).ok) return ready;
  } catch {}
  // Detached GET/HEAD-only preview remains available after the test process ends.
  const log = openSync(fixture + '/server.log', 'a');
  const child = spawn(process.execPath, [fixture + '/server.cjs'], { detached: true, stdio: ['ignore', log, log], env: { PATH: process.env.PATH } });
  child.unref();
  for (let i = 0; i < 100; i++) {
    try { const ready = JSON.parse(await readFile(fixture + '/ready.json', 'utf8')); if (ready.pid === child.pid) return ready; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Local fixture did not start; inspect stamps-fixture/server.log');
}
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const row = (page, name) => page.locator('li').filter({ has: page.getByText(name, { exact: true }) });
const search = page => page.locator('input[type=search]');
const success = 'rgb(6, 120, 88)';

test('actual Stamps JSX/styles: bounded responsive, locale and action browser verification', { skip: !enabled, timeout: 120_000 }, async () => {
  const ready = await prepare(), browser = await chromium.launch({ headless: true });
  const measurements = [], errors = [], external = [], failures = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === ready.url || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  const check = async (name, fn) => { try { await fn(); measurements.push({ name, pass: true }); } catch (error) { failures.push({ name, error: error.message }); } };
  const capture = async name => { await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); }); await page.screenshot({ path: screenshots + '/' + name + '.png', fullPage: true }); };
  try {
    for (const width of [320, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await page.goto(ready.url); await search(page).waitFor(); await settle(page);
      await check('map-first DOM/visible order and overflow ' + width, async () => {
        const data = await page.evaluate(() => {
          const map = document.querySelector('section[aria-label="Interactive world map"]'), list = document.querySelector('aside');
          const a = map.getBoundingClientRect(), b = list.getBoundingClientRect();
          return { domFirst: !!(map.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING), map: { top: a.top, bottom: a.bottom }, list: { top: b.top, left: b.left }, overflow: document.documentElement.scrollWidth > innerWidth + 1, mapHeight: document.querySelector('svg[viewBox="0 0 1100 560"]').getBoundingClientRect().height };
        });
        assert.equal(data.domFirst, true); assert.equal(data.overflow, false);
        if (width < 901) { assert.ok(data.map.bottom <= data.list.top + 1); assert.equal(data.mapHeight, 210); }
        measurements.push({ width, layout: data });
      });
      await capture('stamps-' + width);
      await search(page).fill('Democratic Republic of the Congo'); await settle(page);
      await check('full country label and single-line action layout ' + width, async () => {
        const data = await row(page, 'Democratic Republic of the Congo').evaluate(element => {
          const label = element.querySelector('strong'), visited = element.querySelector('[data-status=visited]'), add = element.querySelector('button[data-status=want]');
          const name = label.getBoundingClientRect(), tick = visited.querySelector('svg').getBoundingClientRect(), text = visited.querySelector('span').getBoundingClientRect();
          const css = getComputedStyle(label), a = visited.getBoundingClientRect();
          return { font: css.fontSize, whitespace: css.whiteSpace, lines: name.height / parseFloat(css.lineHeight), full: label.textContent, clipped: label.scrollWidth > label.clientWidth + 1, rowOverflow: element.scrollWidth > element.clientWidth + 1, visitedColor: getComputedStyle(visited).color, tickRight: tick.left >= text.right, visitedText: visited.innerText, addText: add.innerText, height: a.height, width: a.width, helper: visited.querySelector('small') !== null };
        });
        assert.equal(data.font, '15px'); assert.equal(data.whitespace, 'normal'); assert.equal(data.clipped, false); assert.equal(data.rowOverflow, false);
        if (width < 901) assert.ok(data.lines > 1);
        assert.equal(data.visitedColor, success); assert.equal(data.tickRight, true); assert.equal(data.visitedText, 'Visited'); assert.equal(data.addText, 'Add'); assert.equal(data.helper, false); assert.ok(data.height >= 44 && data.width >= 44);
        measurements.push({ width, country: data });
      });
      await capture('stamps-long-name-' + width);
    }

    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(ready.url); await search(page).fill('France');
    await check('Visited removal/replacement and Add want-to-visit toggle', async () => {
      const france = row(page, 'France'), visited = france.locator('button[data-status=visited]'), add = france.locator('button[data-status=want]');
      assert.equal(await visited.getAttribute('aria-pressed'), 'true'); assert.equal(await visited.evaluate(e => getComputedStyle(e).backgroundColor), success);
      assert.equal(await visited.getAttribute('aria-label'), 'Remove visited mark from France'); await visited.click();
      await page.waitForFunction(() => document.querySelector('li button[data-status=visited]')?.getAttribute('aria-pressed') === 'false');
      await visited.click(); await add.click(); assert.equal(await add.getAttribute('aria-pressed'), 'true'); assert.equal(await visited.getAttribute('aria-pressed'), 'false');
      assert.equal(await add.innerText(), 'Added'); assert.equal(await add.getAttribute('aria-label'), 'Added: Remove France from want to visit'); await add.click();
      assert.equal(await add.getAttribute('aria-pressed'), 'false');
      assert.deepEqual(await page.evaluate(() => window.__stampsFixture.calls), [
        { countryId: 'france', status: null, source: 'explorer' }, { countryId: 'france', status: 'visited', source: 'explorer' },
        { countryId: 'france', status: 'want', source: 'explorer' }, { countryId: 'france', status: null, source: 'explorer' },
      ]);
      await visited.click(); await capture('stamps-visited-green-390');
    });
    await check('pending actions disable both controls; synthetic failure preserves status', async () => {
      const france = row(page, 'France'), visited = france.locator('button[data-status=visited]'), add = france.locator('button[data-status=want]');
      await page.evaluate(() => { window.__stampsFixture.mode = 'pending'; }); await add.click();
      assert.equal(await add.isDisabled(), true); assert.equal(await visited.isDisabled(), true); await capture('stamps-pending-390');
      await page.evaluate(() => window.__stampsFixture.complete()); await page.waitForFunction(() => !document.querySelector('li button[data-status=want]')?.disabled);
      await page.evaluate(() => { window.__stampsFixture.mode = 'error'; }); await visited.click();
      await france.getByRole('alert').waitFor(); assert.equal(await add.getAttribute('aria-pressed'), 'true'); assert.equal(await visited.getAttribute('aria-pressed'), 'false');
      await capture('stamps-error-390');
    });
    await check('actual map selection, Escape focus restoration and memory editing', async () => {
      await page.goto(ready.url); await search(page).fill('France'); const france = row(page, 'France');
      const countryTrigger = france.locator('button').first();
      await countryTrigger.click(); await page.locator('#selected-stamp-country').waitFor();
      assert.equal(await page.getByText('Synthetic saved memory.', { exact: true }).isVisible(), true);
      await page.keyboard.press('Escape'); assert.equal(await page.locator('#selected-stamp-country').count(), 0);
      await page.waitForFunction(node => node === document.activeElement, await countryTrigger.elementHandle());
      assert.equal(await countryTrigger.evaluate(node => node === document.activeElement), true);
      assert.equal(await countryTrigger.getAttribute('aria-controls'), null);
      const mapFrance = page.locator('path[data-country-id=france]'); await mapFrance.focus(); await page.keyboard.press('Enter');
      await page.locator('#selected-stamp-country').getByRole('button', { name: 'Edit', exact: true }).click();
      await page.locator('textarea').fill('Updated synthetic memory'); await page.getByRole('button', { name: 'Save memory', exact: true }).click();
      await page.getByText('Updated synthetic memory', { exact: true }).waitFor(); await capture('stamps-memory-selected-390');
    });
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 }); await page.goto(ready.url + '/?lang=es'); await search(page).fill('Democratic Republic of the Congo');
      await check('Spanish controls with wrapping country label ' + width, async () => {
        assert.equal(await row(page, 'Democratic Republic of the Congo').locator('button[data-status=visited]').innerText(), 'Visitado');
        assert.equal(await row(page, 'Democratic Republic of the Congo').locator('button[data-status=want]').innerText(), 'Añadir');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        assert.equal(await row(page, 'Democratic Republic of the Congo').evaluate(e => e.scrollWidth > e.clientWidth + 1), false);
      });
      await capture('stamps-spanish-' + width);
      // Text-only stress: double the country names, status and button fonts.
      await page.addStyleTag({ content: '[class*=rowCountry] strong{font-size:30px!important}[class*=rowStatusText]{font-size:22px!important}[class*=rowActions] button{font-size:24px!important}' }); await settle(page);
      await check('Spanish 200-percent row text without clipping ' + width, async () => {
        const data = await row(page, 'Democratic Republic of the Congo').evaluate(e => ({ overflow: e.scrollWidth > e.clientWidth + 1, clipped: [...e.querySelectorAll('strong,button')].some(c => c.scrollWidth > c.clientWidth + 1), documentOverflow: document.documentElement.scrollWidth > innerWidth + 1 }));
        measurements.push({ width, largeText: data }); assert.deepEqual(data, { overflow: false, clipped: false, documentOverflow: false });
      });
      await capture('stamps-spanish-large-text-' + width);
    }
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(ready.url + '/?guest&empty'); await search(page).waitFor();
    await check('guest empty state remains usable and overflow-free', async () => {
      assert.equal(await page.getByRole('button', { name: 'Mark a country', exact: true }).isVisible(), true);
      await page.getByRole('button', { name: 'Mark a country', exact: true }).click(); await page.waitForFunction(() => document.activeElement?.getAttribute('type') === 'search'); assert.equal(await search(page).evaluate(e => document.activeElement === e), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    });
    await capture('stamps-guest-empty-390');
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
  } finally {
    await writeFile(evidence + '/stamps-browser-results.json', JSON.stringify({ ready, sourceHead: 'cc99a31880879a62060c53c4933d3714e4db5466', measurements, failures, errors, external, fixtureNotes: 'Actual StampedExperience and CSS; synthetic callbacks/auth state; new isolated browser storage; local-only GET/HEAD preview. No navigation shell or hosted Next runtime.' }, null, 2) + '\n');
    await context.close(); await browser.close();
  }
  assert.equal(failures.length, 0, JSON.stringify(failures, null, 2));
});
