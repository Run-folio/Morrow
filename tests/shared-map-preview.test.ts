import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
test('transfer preview styling belongs to the shared renderer, never Journey-only scope', () => {
  const shared = read('components/easyt/morrovia-map-presentation.module.css');
  assert.match(shared, /planner-map__leg-card/);
  assert.doesNotMatch(read('app/journey/journey.module.css'), /planner-map__leg-card/);
});
test('Overview, Stay and Day preview share one frame and exact View map action', () => {
  assert.ok(existsSync(new URL('../components/easyt/morrovia-map-preview.tsx', import.meta.url)));
  const shared = read('components/easyt/morrovia-map-preview.tsx');
  assert.match(shared, /children/);
  assert.match(shared, /EasyTLinkButton/);
  assert.match(shared, /View map/);
  for (const workspace of ['trip-overview-workspace', 'trip-stay-workspace', 'trip-itinerary-workspace']) {
    assert.match(read(`components/easyt/${workspace}.tsx`), /<MorroviaMapPreview/);
    assert.doesNotMatch(read(`components/easyt/${workspace}.module.css`), /maplibregl-ctrl-attrib/);
  }
});

test('all map previews report initialisation failure instead of loading forever', () => {
  const renderer = read('components/journey-planner-map.tsx');
  assert.match(renderer, /catch \(error\) \{\s*setMapUnavailable\(true\)/);
  assert.match(renderer, /Map unavailable/);
  assert.match(renderer, /!mapUnavailable && basemapStatus/);
});

test('the shared render surface contains its absolute canvas below surrounding controls', () => {
  assert.match(read('components/easyt/morrovia-map-presentation.module.css'), /\.surface\{position:relative\}/);
});
