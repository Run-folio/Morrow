import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { immersiveHomepageRoutes, immersiveRouteKeys } from '../lib/easyt/immersive-homepage-routes.ts';
import { homepageFirstPartyPhotoSlots, routeEditorialImagery } from '../lib/easyt/route-editorial-imagery.ts';
import { isReviewedFirstPartyHomepagePhoto, routeDestinationPhoto, routeEditorialPhoto, routeImages, routePhotoForSource, type RoutePhotoRecord } from '../lib/easyt/route-images.ts';
import { homepageCloudinaryImageLoader } from '../lib/easyt/homepage-cloudinary-image.ts';
import { publicRouteDetailFor } from '../lib/easyt/public-route.ts';
import { routeDetailPresentation } from '../app/journey/routes/[slug]/route-detail-presentation.ts';

test('editorial imagery resolves only to locally served, credited assets and existing overnight bases', () => {
 const credits = readFileSync(new URL('../public/journey/immersive/credits.html', import.meta.url), 'utf8');
 for (const [key, visual] of Object.entries(routeEditorialImagery)) {
  const detail = publicRouteDetailFor(key)!;
  const bases = new Set(detail.stops.map(stop => stop.name));
  assert.equal(routePhotoForSource(routeImages[key])?.key, visual.hero);
  for (const [stopName, base] of Object.entries(visual.bases)) {
   assert.ok(bases.has(stopName));
   for (const photoKey of [base.photoKey, base.panelPhotoKey].filter((value): value is string => Boolean(value))) {
    const photo = routeEditorialPhoto(photoKey)!;
    assert.ok(photo?.author && photo.licenseUrl && photo.sourceUrl);
    assert.ok(credits.includes(`id="${photo.key}"`));
    for (const variant of photo.variants) assert.ok(existsSync(new URL(`../public${variant.src}`, import.meta.url)));
   }
  }
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

test('all seven homepage routes have one gated first-party photography slot', () => {
 const expectedPublicIds = {
  'japan-south-korea': 'japan_tyklgc',
  'iceland-ring-road': 'iceland_rmehmy',
  'balkans-overland': 'montenegro_qdjqbm',
  'vietnam-cambodia': 'cambodia_ki9fqp',
  'namibia-self-drive': 'namibia_vwfyeb',
  'peru-bolivia': 'bolivia_tn5l1g',
  'mexico-guatemala': 'guatemala_jkuqfl',
 } as const;
 assert.deepEqual(Object.keys(homepageFirstPartyPhotoSlots), [...immersiveRouteKeys]);
 for (const [routeKey, slot] of Object.entries(homepageFirstPartyPhotoSlots)) {
  assert.equal(slot.photoKey, `morrovia-homepage-${routeKey}`);
  assert.equal(slot.cloudinaryPublicId, expectedPublicIds[routeKey as keyof typeof expectedPublicIds]);
  assert.match(slot.sourceUrl, new RegExp(`/image/upload/v\\d+/${slot.cloudinaryPublicId}\\.(?:jpg|png)$`));
  const photo = routeEditorialPhoto(slot.photoKey)!;
  assert.equal(isReviewedFirstPartyHomepagePhoto(photo), true);
  assert.equal(photo.provenance, 'reviewed-morrovia-first-party');
  assert.deepEqual(photo.approvedRoles, ['homepage-featured-route']);
  assert.equal(photo.credit, 'Morrovia photography');
  assert.notEqual(routeDestinationPhoto(photo.place, photo.country)?.key, photo.key);
 }

 const slot = homepageFirstPartyPhotoSlots['japan-south-korea'];
 const candidate: RoutePhotoRecord = {
  key: 'morrovia-homepage-japan-south-korea', place: 'Seoul', country: 'South Korea', author: 'Morrovia',
  license: 'Founder-owned', licenseUrl: '', sourceUrl: slot.sourceUrl, changes: 'Cloudinary delivery', alt: 'Mount Fuji',
  variants: [{ src: slot.sourceUrl, width: 5616, height: 3744 }],
  provenance: 'reviewed-morrovia-first-party', approvedRoles: ['homepage-featured-route'],
 };
 assert.equal(isReviewedFirstPartyHomepagePhoto(candidate), true);
 assert.equal(isReviewedFirstPartyHomepagePhoto({ ...candidate, approvedRoles: [] }), false);
 assert.equal(isReviewedFirstPartyHomepagePhoto({ ...candidate, sourceUrl: 'https://res.cloudinary.com/dbt3wkwa3/image/upload/v1/unreviewed.jpg', variants: [{ ...candidate.variants[0], src: 'https://res.cloudinary.com/dbt3wkwa3/image/upload/v1/unreviewed.jpg' }] }), false);
 assert.equal(isReviewedFirstPartyHomepagePhoto({ ...candidate, variants: [{ ...candidate.variants[0], src: '/journey/illustrations/map.png' }] }), false);
});

test('Homepage Cloudinary delivery is responsive, format-aware and account-scoped', () => {
 const source = homepageFirstPartyPhotoSlots['balkans-overland'].sourceUrl;
 assert.equal(homepageCloudinaryImageLoader({ src: source, width: 828 }), source.replace('/image/upload/', '/image/upload/f_auto,q_auto:low,c_limit,w_828/'));
 assert.match(homepageCloudinaryImageLoader({ src: source, width: 3840 }), /f_auto,q_auto:low,c_limit,w_1920/);
 assert.throws(() => homepageCloudinaryImageLoader({ src: 'https://res.cloudinary.com/another-account/image/upload/photo.jpg', width: 828 }));
 const nextConfig = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
 assert.match(nextConfig, /deviceSizes: \[640, 750, 828, 1080, 1200, 1440, 1920, 2048, 3840\]/);
 assert.match(nextConfig, /hostname: "res\.cloudinary\.com"[\s\S]+pathname: "\/dbt3wkwa3\/\*\*"/);
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
   if (homepage.firstParty) assert.match(variant.src, /^https:\/\/res\.cloudinary\.com\/dbt3wkwa3\/image\/upload\/v\d+\//);
   else assert.ok(existsSync(new URL(`../public${variant.src}`, import.meta.url)));
  }
  if (homepage.firstParty) {
   assert.equal(homepage.credit, 'Morrovia photography');
   assert.equal(homepage.fallback?.firstParty, false);
   assert.ok(homepage.fallback?.source.startsWith('https://'));
  } else if ('photoKey' in role) {
   assert.notEqual(role.photoKey, routeEditorialImagery[route.key].hero, route.key);
   assert.equal(homepage.source, routeEditorialPhoto(role.photoKey)?.sourceUrl, route.key);
  } else {
   assert.ok(homepage.variants.every(variant => variant.src.includes(role.generatedAsset)), route.key);
  }
 }
});
