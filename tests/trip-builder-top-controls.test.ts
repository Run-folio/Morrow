import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
test('mounted Builder owns the approved top controls and the existing table map',()=>{
 assert.match(source,/<TripBuilderTopControls/);
 assert.match(source,/<TripBuilderRouteWorkspace/);
 assert.doesNotMatch(source,/<TripBuilderRetainedReview/);
 assert.doesNotMatch(source,/showBuilderReview/);
});
test('homepage and Builder share destination field presentation',async()=>{
 const home=await readFile(new URL('../app/journey/home/home-destination-editor.tsx',import.meta.url),'utf8');
 assert.match(home,/MorroviaDestinationField/);assert.match(home,/MorroviaDestinationTag/);
});
