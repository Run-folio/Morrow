import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';

const css = postcss.parse(readFileSync(new URL('../components/easyt/trip-transport-workspace.module.css', import.meta.url)));
function value(selector, property) {
  let result;
  css.walkRules(selector, rule => rule.walkDecls(property, decl => { result = decl.value; }));
  return result;
}
test('airport selector takes only its own width without narrowing the editor form', () => {
  assert.equal(value('.airportSearch > button', 'justify-self'), 'start');
});
test('provider handoff copy occupies a separate line after transport actions', () => {
  assert.equal(value('.omioAction', 'display'), 'contents');
  assert.equal(value('.omioAction > small', 'flex-basis'), '100%');
  assert.equal(value('.omioAction > small', 'order'), '1');
});
