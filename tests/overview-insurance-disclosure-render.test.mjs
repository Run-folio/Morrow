import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const { outputFiles } = await build({ entryPoints: ['components/easyt/trip-preparation.tsx'],
  bundle: true, write: false, outfile: 'cards.cjs', format: 'cjs', platform: 'node',
  packages: 'external', jsx: 'automatic', loader: { '.module.css': 'empty' } });

for (const preview of [true, false]) test('insurance disclosure with ' + (preview ? 'disabled preview' : 'live sponsored link'), () => {
  const module = { exports: {} };
  new vm.Script(outputFiles[0].text).runInNewContext({ module, exports: module.exports, require,
    console, process: { env: { MORROVIA_INERT_OVERVIEW_PAID_PREVIEW: preview ? '1' : '0' } } });
  const html = renderToStaticMarkup(React.createElement(module.exports.TripPreparationCards, {
    tasks: [{ id: 'insurance', title: 'Insurance', detail: 'Check coverage', status: 'to-review',
      action: { provider: 'world-nomads', affiliate: true, href: preview ? '#overview-preview-wn' : 'https://example.invalid/quote', label: 'Get a quote' } }],
    tripId: 'demo', language: 'en', isPending: () => false, onStatusChange() {},
  }));
  if (preview) {
    assert.match(html, /About this insurance ad/);
    assert.match(html, /<button\b[^>]*disabled[^>]*>[\s\S]*?Get a quote/);
    assert.doesNotMatch(html, /We receive a fee/);
  } else {
    assert.match(html, /href="https:\/\/example.invalid\/quote"/);
    assert.match(html, /<small[^>]*>We receive a fee/);
  }
});
