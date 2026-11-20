import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Stay22 stays inert without explicit opt-in',()=>{
 const pilot=read('components/easyt/trip-stay22-pilot.tsx');
 assert.match(pilot,/NEXT_PUBLIC_MORROVIA_STAY22_PILOT !== "true".*return null/);
});
