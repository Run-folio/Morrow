import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,statSync} from 'node:fs';
import inventory from '../public/journey/immersive/itinerary-image-inventory.json' with {type:'json'};
import {routePhotoForSource} from '../lib/easyt/route-images.ts';
import {isReusableWikimediaLicense} from '../lib/easyt/photo-attribution.ts';

test('curated itinerary files retain their reviewed subject, author, licence and compact variants',()=>{
 const expected={
  'day-kyoto-kinkakuji':['Japan_Kyoto_Kinkakuji_DSC00117.jpg','David Monniaux','CC BY-SA 3.0'],
  'day-tokyo-imperial-palace':['Spring_season_at_the_Imperial_Palace,_Tokyo;_March_2013_(03).jpg','yisris','CC BY 2.0'],
  'day-tokyo-big-sight':['Tokyo_Big_Sight_at_Night.jpg','Masato Ohta from Tokyo, Japan.','CC BY 2.0'],
  'day-kyoto-ninenzaka':['Pedestrian_road_with_pavements_and_paper_umbrellas,_Higashiyama-ku,_Kyoto,_Japan,_early_morning.jpg','Basile Morin','CC BY-SA 4.0'],
 };
 expected['day-tokyo-shinjuku-gyoen' as keyof typeof expected]=['Shinjuku_Gyoen_National_Garden_-_sakura_3.JPG','Kakidai','CC BY-SA 3.0'];
 expected['day-tokyo-park-tower' as keyof typeof expected]=['Shinjuku_Park_Tower_2018_from_MetGovBld.jpg','FLOEP','CC0'];
 const credits=readFileSync('public/journey/immersive/credits.html','utf8');
 for(const photo of inventory){
  const known=expected[photo.key as keyof typeof expected];
  if(known){
   const [file,author,license]=known;
   assert.equal(decodeURIComponent(new URL(photo.sourceUrl).pathname),`/wiki/File:${file}`);
   assert.equal(photo.author,author);assert.equal(photo.license,license);
  }
  assert.equal(new URL(photo.sourceUrl).hostname,'commons.wikimedia.org');
  assert.ok(photo.author.trim());
  assert.ok(photo.alt.trim());
  assert.ok(isReusableWikimediaLicense(photo.license,photo.licenseUrl));
  assert.ok(credits.includes(`id="${photo.key}"`));
  assert.match(photo.changes,/Resized and converted to WebP/);
  assert.deepEqual(photo.variants.map(v=>v.width),[384,768,1280]);
  assert.ok(photo.variants[0].bytes<25_000,'Calendar photograph remains below 25kB');
  for(const variant of photo.variants){
   assert.equal(statSync(`public${variant.src}`).size,variant.bytes);
   assert.equal(routePhotoForSource(variant.src)?.sourceUrl,photo.sourceUrl);
  }
 }
});
