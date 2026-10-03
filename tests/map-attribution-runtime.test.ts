import assert from 'node:assert/strict';
import test from 'node:test';
import { installMorroviaMapAttribution } from '../components/easyt/morrovia-map-runtime.ts';

test('native credits show initially and collapse through the disclosure after five seconds', t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{value:{activeElement:null},configurable:true});
  let visible=true, clicks=0;
  const credits={textContent:'OpenFreeMap © OpenMapTiles Data from OpenStreetMap'};
  const button={click(){visible=false;clicks++;}};
  const attribution={querySelector(selector:string){return selector.includes('inner')?credits:button;},contains(){return false;},matches(){return false;},classList:{contains(){return visible;}}};
  const events=new Map<string,()=>void>();
  const container=new EventTarget() as EventTarget & {querySelector:()=>unknown};
  container.querySelector=()=>attribution;
  const dispose=installMorroviaMapAttribution({getContainer:()=>container as unknown as HTMLElement,on(event,callback){events.set(event,callback);},off(event){events.delete(event);}});
  try {
    assert.equal(visible,true);
    t.mock.timers.tick(4999);
    assert.equal(clicks,0);
    t.mock.timers.tick(1);
    assert.equal(clicks,1);
    assert.equal(credits.textContent,'OpenFreeMap © OpenMapTiles Data from OpenStreetMap');
    dispose();
    assert.equal(events.size,0);
    t.mock.timers.tick(10000);
    assert.equal(clicks,1);
  } finally {
    dispose();
    if(previous) Object.defineProperty(globalThis,'document',previous); else Reflect.deleteProperty(globalThis,'document');
  }
});
