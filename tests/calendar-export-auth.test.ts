import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarConsentScopes, calendarConsentURL, validateCalendarGrant, assertCalendarRequestOrigin } from '../lib/easyt/calendar-export-auth.ts';
test('calendar consent is incremental foreground access with PKCE and separate callback', async () => {
    const url = await calendarConsentURL({ clientId: 'client', origin: 'https://morrovia.com', state: 'random-state', verifier: 'a'.repeat(64), kind: 'existing-owned' });
    assert.equal(url.origin, 'https://accounts.google.com');
    assert.equal(url.searchParams.get('access_type'), 'online');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('prompt'), 'select_account consent');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://morrovia.com/api/easyt/calendar-export/callback');
    assert(!url.searchParams.get('scope')!.split(' ').includes('https://www.googleapis.com/auth/calendar'));
    assert(calendarConsentScopes('new-trip').includes('https://www.googleapis.com/auth/calendar.app.created'));
    assert(!calendarConsentScopes('new-trip').includes('https://www.googleapis.com/auth/calendar.events.owned'));
});
test('provider identity, access expiry and required grants are verified without accepting client identity', () => {
    assert.throws(() => validateCalendarGrant({ accessToken: 't', expiresAt: Date.now() + 60000, scopes: [], subject: 'subject', email: 'a@b.com' }, 'existing-owned'), /MISSING_SCOPES/);
    assert.throws(() => validateCalendarGrant({ accessToken: 't', expiresAt: 0, scopes: calendarConsentScopes('existing-owned'), subject: 'sub', email: 'a@b.com' }, 'existing-owned'), /AUTH_REQUIRED/);
    assert.throws(() => validateCalendarGrant({ accessToken: 't', expiresAt: Date.now() + 60000, scopes: calendarConsentScopes('existing-owned'), subject: '', email: 'a@b.com' }, 'existing-owned'), /INVALID_GOOGLE_IDENTITY/);
});
test('mutation origin is mandatory and exact; cross-site requests are refused', () => {
    assert.throws(() => assertCalendarRequestOrigin(new Request('https://morrovia.com/api', { method: 'POST' }), 'https://morrovia.com'), /INVALID_ORIGIN/);
    assert.throws(() => assertCalendarRequestOrigin(new Request('https://morrovia.com/api', { method: 'POST', headers: { Origin: 'https://evil.example' } }), 'https://morrovia.com'), /INVALID_ORIGIN/);
    assert.doesNotThrow(() => assertCalendarRequestOrigin(new Request('https://morrovia.com/api', { method: 'POST', headers: { Origin: 'https://morrovia.com', 'Sec-Fetch-Site': 'same-origin' } }), 'https://morrovia.com'));
});
import { completeCalendarConsent } from '../lib/easyt/calendar-export-auth.ts';
test('callback consumes one-use owner-bound state before exchange; replay and wrong owner never exchange', async () => {
    let used = false, exchanges = 0, saved = 0;
    const state = { ownerId: 'owner', tripId: 'trip', kind: 'existing-owned' as const, verifier: 'verifier', expiresAt: Date.now() + 60000 };
    const deps = { async consume() {
            if (used)
                return null;
            used = true;
            return state;
        }, async exchange() { exchanges++; return { accessToken: 'access', expiresAt: Date.now() + 60000, scopes: calendarConsentScopes('existing-owned'), subject: 'sub', email: 'a@b.com' }; }, async save() { saved++; } };
    await assert.rejects(() => completeCalendarConsent({ ownerId: 'other', state: 'state', code: 'code' }, deps), /INVALID_STATE/);
    assert.equal(exchanges, 0);
    used = false;
    await completeCalendarConsent({ ownerId: 'owner', state: 'state', code: 'code' }, deps);
    assert.equal(saved, 1);
    await assert.rejects(() => completeCalendarConsent({ ownerId: 'owner', state: 'state', code: 'code' }, deps), /INVALID_STATE/);
    assert.equal(exchanges, 1);
});
import { calendarDestinationsForGrant } from '../lib/easyt/calendar-export-auth.ts';
test('app-created-only consent can choose its existing trip calendar without owned-event permission', () => { const all = [{ id: 'personal' }, { id: 'created' }]; assert.deepEqual(calendarDestinationsForGrant(all, calendarConsentScopes('new-trip'), ['created']), [{ id: 'created' }]); assert.deepEqual(calendarDestinationsForGrant(all, calendarConsentScopes('existing-owned'), []), all); assert.deepEqual(calendarDestinationsForGrant(all, [], ['created']), []); });
