import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

test('shared trip-header facts remain visible instead of moving behind mobile actions', () => {
  const css = postcss.parse(readFileSync(new URL('../components/easyt/trip-shell.module.css', import.meta.url), 'utf8'));
  let headerRules = 0;
  css.walkRules(rule => {
    if (!rule.selectors.some(selector => selector === '.metadata' || selector === '.tripIdentity > .metadata')) return;
    headerRules++;
    rule.walkDecls('display', declaration => assert.notEqual(declaration.value, 'none',
      `Trip dates and facts must remain visible: ${rule.parent.params ?? 'base'} / ${rule.selector}`));
  });
  assert.ok(headerRules > 0, 'the shared metadata owner is included in the stylesheet');
});
