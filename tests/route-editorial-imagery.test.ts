import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { immersiveHomepageRoutes, immersiveRouteKeys } from '../lib/easyt/immersive-homepage-routes.ts';
import { routeEditorialImagery } from '../lib/easyt/route-editorial-imagery.ts';
import { routeEditorialPhoto, routeImages, routePhotoForSource } from '../lib/easyt/route-images.ts';
import { publicRouteDetailFor } from '../lib/easyt/public-route.ts';
import { routeDetailPresentation } from '../app/journey/routes/[slug]/route-detail-presentation.ts';

test('editorial imagery resolves only to locally served, credited assets and existing overnight bases', () => {
 const credits = readFileSync(new URL('../public/journey/immersive/credits.html', import.meta.url), 'utf8');
 for (const [key, visual] of Object.entries(routeEditorialImagery)) {
  const detail = publicRouteDetailFor(key)!;
  const bases = new Set(detail.stops.map(stop => stop.name));
  assert.equal(routePhotoForSource(routeImages[key])?.key, visual.hero);
  for (const moment of visual.moments) {
   assert.ok(bases.has(moment.stopName));
   assert.ok(moment.context);
   const photo = routeEditorialPhoto(moment.photoKey)!;
   assert.ok(photo?.author && photo.licenseUrl && photo.sourceUrl);
   assert.ok(credits.includes(`id="${photo.key}"`));
   for (const variant of photo.variants) assert.ok(existsSync(new URL(`../public${variant.src}`, import.meta.url)));
  }
 }
});

test('landmark images never become overnight route stops or change the Builder draft', () => {
 for (const key of ['vietnam-cambodia','iceland-ring-road','balkans-overland']) {
  const detail = publicRouteDetailFor(key)!;
  const before = JSON.stringify(detail.planDraft);
  const visual = routeDetailPresentation(detail);
  assert.ok(visual.experiences.every(moment => moment.photo));
  assert.equal(JSON.stringify(detail.planDraft), before);
  assert.ok(!detail.stops.some(stop => ['Angkor Wat','Jökulsárlón','Tràng An'].includes(stop.name)));
 }
 const vietnam=routeDetailPresentation(publicRouteDetailFor('vietnam-cambodia')!);
 assert.equal(vietnam.hero?.key,'angkor-wat');
 assert.equal(vietnam.photos.at(-1)?.key,'angkor-wat');
 const iceland=routeDetailPresentation(publicRouteDetailFor('iceland-ring-road')!);
 assert.equal(iceland.hero?.key,'glacier-lagoon');
 assert.ok(iceland.photoCaptions[0]?.includes('Reykjavík'));
});


test('every featured homepage scene is explicit, licensed and distinct from its route hero', () => {
 const featured = immersiveHomepageRoutes();
 assert.deepEqual(new Set(featured.map(route => route.key)), new Set(immersiveRouteKeys));
 for (const route of featured) {
  const role = routeEditorialImagery[route.key].homepageHero;
  const homepage = route.heroPhoto!;
  const detailHero = routeDetailPresentation(publicRouteDetailFor(route.key)!).hero!;
  assert.ok(role && homepage && detailHero, route.key);
  assert.ok(homepage.rights && homepage.source, route.key);
  assert.notEqual(homepage.source, detailHero.sourceUrl, route.key);
  const routeSources = new Set(detailHero.variants.map(variant => variant.src));
  for (const variant of homepage.variants) {
   assert.ok(!routeSources.has(variant.src), route.key);
   assert.ok(existsSync(new URL(`../public${variant.src}`, import.meta.url)));
  }
  if ('photoKey' in role) {
   assert.notEqual(role.photoKey, routeEditorialImagery[route.key].hero, route.key);
   assert.equal(homepage.source, routeEditorialPhoto(role.photoKey)?.sourceUrl, route.key);
  } else {
   assert.ok(homepage.variants.every(variant => variant.src.includes(role.generatedAsset)), route.key);
  }
 }
});
