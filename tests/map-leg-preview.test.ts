import assert from 'node:assert/strict';
import test from 'node:test';
import { mapLegPreviewPosition } from '../components/easyt/morrovia-map-leg-preview.ts';
for (const width of [250,390,430,600,1024,1440]) {
 test(`transfer preview remains within ${width}px map at every edge`,()=>{
  for (const x of [0,width/2,width]) for (const y of [0,115,230]) {
   const position=mapLegPreviewPosition({width,height:230},{x,y},{width:300,height:150});
   assert.ok(position.left>=12 && position.left+Math.min(300,width-24)<=width-12);
   assert.ok(position.top>=12 && position.top+150<=218);
  }
 });
}
