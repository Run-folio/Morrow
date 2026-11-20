import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('starter list remains the default and the swipe review is explicitly opted into',()=>{
 const starter=read('components/easyt/trip-starter.tsx');
 assert.match(starter,/enableSwipeDeck=process.env.NEXT_PUBLIC_MORROVIA_STARTER_SWIPE_PILOT==="true"/);
 assert.match(starter,/onDeckSave=\{enableSwipeDeck\?saveDeckIdea:undefined\}/);
 assert.match(read('components/easyt/trip-starter.stories.tsx'),/initialActivities=\{starterKyotoCards\} enableSwipeDeck/);
});
test('Stay22 stays inert without explicit opt-in',()=>{
 const pilot=read('components/easyt/trip-stay22-pilot.tsx');
 assert.match(pilot,/NEXT_PUBLIC_MORROVIA_STAY22_PILOT !== "true".*return null/);
});
