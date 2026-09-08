import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { publicRouteDetailFor } from '../lib/easyt/public-route.ts';
const base=process.env.ROUTE_DETAIL_CHECK_URL || 'http://127.0.0.1:3100';
const keys=['japan-slow','balkans-overland','vietnam-cambodia','iceland-ring-road'];
const results=[];
for(const key of keys){
  const response=await fetch(`${base}/journey/routes/${key}`);
  assert.equal(response.status,200,key);
  const raw=await response.text();
  const html=raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<!--[^]*?-->/g,'');
  const detail=publicRouteDetailFor(key);
  const stops=[...html.matchAll(/id="route-stop-(\d+)"[\s\S]*?<h3[^>]*>([^<]+)/g)].map(match=>match[2]);
  assert.deepEqual(stops,detail.stops.map(stop=>stop.name),key);
  assert.equal((html.match(/>Start with this route</g)||[]).length,3,key);
  assert.ok(html.includes(`homeDraft=1&amp;inspire=${key}`),key);
  assert.ok(html.includes('Shape the nights in Builder'),key);
  assert.ok(html.includes('Minimum')&&html.includes('Reviewed guidance')&&html.includes('example starting point'),key);
  assert.ok(html.includes('id="route-map"')&&html.includes('aria-live="polite"'),key);
  assert.ok(html.includes(`href="https://morrovia.com/journey/routes/${key}"`),key);
  assert.ok(!/<meta name="robots" content="[^"]*noindex/.test(html),key);
  results.push({key,status:response.status,stops,canonical:true,startActions:3,nightLabels:true});
}
for(const key of ['not-a-real-route','colombia-ecuador']){
  const r=await fetch(`${base}/journey/routes/${key}`);const body=await r.text();
  // Next can stream the parent shell (200) before notFound renders. Preserve
  // the actual non-indexable not-found boundary, not an assumed wire status.
  assert.ok([200,404].includes(r.status),key);
  assert.match(body,/<meta name="robots" content="noindex"/,key);
  assert.ok(body.includes('NEXT_HTTP_ERROR_FALLBACK;404'),key);
  assert.ok(!body.includes('>Start with this route<'),key);
  results.push({key,status:r.status,renderedNotFound:true,noindex:true});
}
writeFileSync('artifacts/immersive-route-detail/http-checks.json',JSON.stringify(results,null,2));
const redirect=await fetch(`${base}/journey/routes/portugal-coast`,{redirect:'manual'});
const redirectBody=await redirect.text();
assert.ok(redirect.status === 308 || (redirect.status === 200 && redirectBody.includes('NEXT_REDIRECT')));
assert.ok(redirect.headers.get('location') === '/journey/routes/portugal-atlantic' || redirectBody.includes('/journey/routes/portugal-atlantic;308')); 
results.push({key:'portugal-coast',status:redirect.status,redirect:redirect.headers.get('location')});
writeFileSync('artifacts/immersive-route-detail/http-checks.json',JSON.stringify(results,null,2));
console.log('PASS: four rendered public routes, canonical stop order, night labels, CTA links, map, metadata, two non-indexable not-found boundaries and legacy redirect.');
