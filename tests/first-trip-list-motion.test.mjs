import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

for (const [file, target, safeElement, ready] of [
  ['components/easyt/trip-stay-workspace.tsx','stay-result-name','h4','finder.status === "ready" && visibleCandidates.length > 0'],
  ['components/easyt/trip-transport-workspace.tsx','transport-route-name','h3','items.length > 0'],
  ['app/journey/dashboard/dashboard-client.tsx','trip-list-facts','p','visibleTrips.length > 0'],
  ['app/journey/login/guest-device-trips.tsx','device-trip-name','strong','state.kind === "ready" && state.trips.length > 0'],
]) {
  test(`${target}: one populated-list reveal targets only descriptive content`, () => {
    const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    assert.equal(source.split(`selector="[data-${target}]"`).length-1,1);
    assert.ok(source.includes(`<EntryReveal ready={${ready}} selector="[data-${target}]" />`));
    assert.match(source,new RegExp(`<${safeElement}[^>]*data-${target}[^>]*>`));
  });
}
