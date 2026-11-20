import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../components/easyt/trip-transport-workspace.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../components/easyt/trip-transport-workspace.module.css', import.meta.url), 'utf8');

test('search and alternatives share the visible connection actions without an overflow menu', () => {
  const actions = source.slice(source.indexOf('<div className={styles.connectionActions}'), source.indexOf('{!item.bookingMismatch && item.manualBooking ?'));
  assert.match(actions, /<TransportAffiliateAction/);
  assert.match(actions, /<TripTransportChoiceControl/);
  assert.doesNotMatch(actions, /<details|<summary/);
});

test('the booking control has independent focus, covers mark and undo, and uses acknowledged state', () => {
  const card = source.slice(source.indexOf('function TransportCard'), source.indexOf('function SelectedJourneyDetail'));
  assert.match(card, /aria-pressed=\{bookingMarked\}/);
  assert.match(card, /isAccountCopySettled\(\)/);
  assert.match(card, /markTransportLegBooked\(/);
  assert.match(card, /unmarkTransportBooking\(/);
  assert.match(styles, /\.bookingToggle:focus-visible/);
});
