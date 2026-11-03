import assert from 'node:assert/strict';
import test from 'node:test';
import { tripFromBuilder } from '../lib/easyt/trip.ts';
import { createQuotaRefusedRetryFixture, createCompletedCreationContinuationFixture } from '../components/easyt/storybook/builder-recovery-fixtures.ts';

function source() {
  return tripFromBuilder({ id: 'synthetic-storybook-source', origin: '', stops: [
    { id: 'cancun', name: 'Cancún', country: 'Mexico', canonicalPlaceId: 'cancun', coordinates: [-86.8515, 21.1619] },
    { id: 'tulum', name: 'Tulum', country: 'Mexico', canonicalPlaceId: 'tulum', coordinates: [-87.4654, 20.2114] },
  ], startDate: '2027-04-02', endDate: '2027-04-08', picks: {}, mustDo: '', pace: 'slow', hotels: 'few', budget: 'mid', draft: [] });
}

test('native quota refusal preserves exact source until the production controller retries once', async () => {
  const fixture = await createQuotaRefusedRetryFixture(source());
  try {
    const refused = fixture.session.getSnapshot();
    assert.equal(refused.error?.retryableEdit, true);
    assert.equal(refused.trip.brief.budgetBand, 'mid');
    assert.equal(refused.acceptedRevision, 0);
    assert.equal(fixture.sourcePreserved(), true);
    assert.equal(fixture.quotaFailures(), 1);
    assert.equal(fixture.recovery()?.trip.brief.budgetBand, 'mid');
    const receipt = await fixture.session.retryRejectedEdit();
    assert.ok(receipt);
    assert.equal(fixture.session.isCommandReceiptCurrent(receipt), true);
    assert.equal(fixture.session.getSnapshot().trip.brief.budgetBand, 'high');
    assert.equal(fixture.session.getSnapshot().acceptedRevision, 1);
    assert.equal(fixture.session.getSnapshot().error, null);
    assert.equal(fixture.recovery()?.trip.brief.budgetBand, 'high');
    assert.equal(fixture.quotaFailures(), 1);
    const saved = fixture.bytes();
    assert.equal(await fixture.session.retryRejectedEdit(), null);
    assert.equal(fixture.bytes(), saved);
  } finally { fixture.dispose(); }
});

test('independent quota fixtures retain separate sources and dispose retires pending retry', async () => {
  const first = await createQuotaRefusedRetryFixture(source());
  const second = await createQuotaRefusedRetryFixture(source());
  try {
    first.dispose();
    assert.equal(await first.session.retryRejectedEdit(), null);
    assert.ok(await second.session.retryRejectedEdit());
    assert.equal(first.session.getSnapshot().trip.brief.budgetBand, 'mid');
    assert.equal(second.session.getSnapshot().trip.brief.budgetBand, 'high');
  } finally { first.dispose(); second.dispose(); }
});

test('completed creation cold reopen claims later document without changing any proof bytes', async () => {
  const fixture = await createCompletedCreationContinuationFixture(source());
  try {
    const before = fixture.bytes();
    const opened = await fixture.open();
    assert.equal(opened.pendingCreation, null);
    assert.equal(opened.seed.initialTrip.title, 'Synthetic later traveller edit');
    assert.notEqual(opened.seed.initialTrip.title, fixture.initialTitle);
    assert.equal(opened.seed.initialRecovery?.writeId, 'synthetic-later-edit');
    assert.equal(opened.sourcePreserved, true);
    assert.equal(fixture.bytes(), before);
    assert.deepEqual((await fixture.open()).seed, opened.seed);
    assert.equal(fixture.bytes(), before);
  } finally { fixture.dispose(); }
});

test('disposed completed-creation fixture cannot claim a new cold seed', async () => {
  const fixture = await createCompletedCreationContinuationFixture(source());
  fixture.dispose();
  await assert.rejects(fixture.open(), /retired/);
});
