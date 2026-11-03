import assert from 'node:assert/strict';
import test from 'node:test';
import { placeAutocompleteKeyAction } from '../lib/easyt/place-autocomplete.ts';
test('closed search does not select a hidden option on Enter', () => {
  assert.deepEqual(placeAutocompleteKeyAction('Enter', 1, 3, {open:false}), {activeIndex:-1,choose:false,close:false});
});
test('IME confirmation does not select or dismiss a place', () => {
  assert.deepEqual(placeAutocompleteKeyAction('Enter', 1, 3, {composing:true}), {activeIndex:1,choose:false,close:false});
  assert.deepEqual(placeAutocompleteKeyAction('Escape', 1, 3, {composing:true}), {activeIndex:1,choose:false,close:false});
});
test('empty result lists clear stale active descendants', () => {
  assert.deepEqual(placeAutocompleteKeyAction('ArrowDown', 6, 0), {activeIndex:-1,choose:false,close:false});
});
test('Escape from a closed search remains available to its enclosing dialog', () => {
  assert.deepEqual(placeAutocompleteKeyAction('Escape', -1, 0, {open:false}), {activeIndex:-1,choose:false,close:false});
});
