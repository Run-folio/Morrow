import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {resolvePlaceMentions} from '../lib/easyt/place-intelligence.ts';
import {createDiscoveryDraft} from '../lib/easyt/discovery-draft.ts';
import {projectDiscovery} from '../lib/easyt/discovery-projection.ts';

const require = createRequire(import.meta.url);
const bundle = (await build({entryPoints: ['components/easyt/discovery-modal.tsx'], bundle: true, write: false,
  outfile: 'offline-discovery.cjs', format: 'cjs', platform: 'node', packages: 'external', jsx: 'automatic',
  loader: {'.css': 'empty', '.module.css': 'empty'}, define: {'process.env.NODE_ENV': '"test"'}})).outputFiles[0]!.text;
const module = {exports: {} as any};
new vm.Script(bundle).runInNewContext({module, exports: module.exports, require, console, process: {env: {NODE_ENV: 'test'}}});
function render(loading: boolean) {
  const mention = resolvePlaceMentions('Australia').mentions[0]!;
  const draft = {...createDiscoveryDraft(), step: 'places' as const, shortlistIds: ['sydney']};
  return renderToStaticMarkup(React.createElement(module.exports.DiscoveryModal, {open: true, loading,
    entry: {kind: 'country', step: 'places'}, mention, draft,
    projection: projectDiscovery({mention, draft, context: {interests: [], existingPlaceIds: []}}),
    onAction() {}, onConfirm() {}, onClose() {},
  }));
}
const buttons = (html: string) => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(match => ({
  disabled: /\sdisabled(?:=|\s|$)/.test(match[1]!), text: match[2]!.replace(/<[^>]*>/g, ''),
}));

test('committing Discovery renders native disabled close, Back, reset, finish and confirm controls', () => {
  const controls = buttons(render(true));
  for (const label of ['Close Discovery', 'Back', 'Reset choices', 'Finish later'])
    assert.ok(controls.some(control => control.text === label), `${label} must actually render`);
  assert.ok(controls.some(control => /^Add(?: \d+)? places?$/.test(control.text)), 'the confirm action must actually render');
  assert.ok(controls.every(control => control.disabled), 'no rendered navigation/dismissal control can remain enabled');
});

test('idle Discovery retains enabled Back, reset and Finish later rather than permanently locking the UI', () => {
  const html = render(false), footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1];
  assert.ok(footer, 'real modal footer is rendered');
  const controls = buttons(footer);
  for (const label of ['Back', 'Reset choices', 'Finish later']) assert.equal(controls.find(control => control.text === label)?.disabled, false, label);
});
