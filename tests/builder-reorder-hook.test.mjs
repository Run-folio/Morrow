import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),{build}=require('esbuild');
const compiled=(await build({entryPoints:['app/journey/new/use-builder-stop-reorder.ts'],bundle:true,write:false,format:'cjs',platform:'node',packages:'external',plugins:[{name:'hook-runner',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'hooks'}));b.onLoad({filter:/.*/,namespace:'hooks'},()=>({contents:'export const useState=(...a)=>globalThis.hooks.useState(...a);export const useRef=(...a)=>globalThis.hooks.useRef(...a);export const useCallback=f=>f;export const useEffect=()=>{};'}));}}]})).outputFiles[0].text;
function runner({commit=()=>true,locked=[],fixed=false}={}){
 const state=[],refs=[],commits=[],previews=[];let si=0,ri=0,current,hit=null;
 const surface={},foreign={};
 const node=(index,root=surface)=>({closest:s=>s==='[data-builder-reorder-surface]'?root:null,getAttribute:()=>String(index)});
 const target={focus(){this.focused=true},closest:()=>surface,setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){}};
 const hooks={useState(initial){const i=si++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},useRef(initial){const i=ri++;return refs[i]??(refs[i]={current:initial})}};
 const document={elementFromPoint:()=>hit,activeElement:null};const module={exports:{}};vm.runInNewContext(compiled,{module,exports:module.exports,require,hooks,console,document});
 const options={stopIds:['a','b','c'],stopLabels:{a:'Alpha',b:'Beta',c:'Gamma'},lockedStopIds:locked,fixedOrder:fixed,onPreview:v=>previews.push(v),onCommit:(ids,source)=>{commits.push({ids:[...ids],source});return commit(ids,source)}};
 const render=()=>{si=ri=0;current=module.exports.useBuilderStopReorder(options);return current};
 const event=()=>({pointerType:'touch',pointerId:7,isPrimary:true,button:0,clientX:20,clientY:20,currentTarget:target,preventDefault(){},stopPropagation(){}});
 const pointer=kind=>render().gripProps('a')[kind](event());
 return {render,commits,previews,target,options,pointer,document,exports:module.exports,setHit(index,external=false){hit=index===null?null:node(index,external?foreign:surface)}};
}
test('touch release outside this route never commits the previous target',async()=>{
 const h=runner();h.pointer('onPointerDown');h.setHit(1);h.pointer('onPointerMove');h.setHit(null);await h.pointer('onPointerUp');assert.equal(h.commits.length,0);
});
test('touch release on a blocked target or another reorder surface cancels',async()=>{
 for(const foreign of [false,true]){const h=runner({locked:foreign?[]:['c']});h.pointer('onPointerDown');h.setHit(1);h.pointer('onPointerMove');h.setHit(2,foreign);await h.pointer('onPointerUp');assert.equal(h.commits.length,0);}
});
test('lost pointer capture cancels without a mutation',()=>{
 const h=runner();h.pointer('onPointerDown');h.setHit(1);h.pointer('onPointerMove');h.pointer('onLostPointerCapture');assert.equal(h.render().draggingId,null);assert.equal(h.commits.length,0);
});
test('rejected and throwing acceptance never announce success',async()=>{
 for(const commit of [()=>false,()=>Promise.reject(Error('denied'))]){const h=runner({commit});await h.render().moveFromMenu('a',1);assert.match(h.render().announcement,/not applied/i);assert.doesNotMatch(h.render().announcement,/moved/i);}
});
test('pending acceptance cannot dispatch twice and announces only after acceptance',async()=>{
 let release;const h=runner({commit:()=>new Promise(r=>{release=r})});const pending=h.render().moveFromMenu('a',1);const second=h.render().moveFromMenu('a',2);assert.equal(h.commits.length,1);assert.equal(await second,false);assert.doesNotMatch(h.render().announcement,/moved/i);release(true);await pending;assert.match(h.render().announcement,/Alpha.*2.*3/);
});
test('fixed order and protected-stop barriers never dispatch',async()=>{
 for(const options of [{fixed:true},{locked:['b']}]){const h=runner(options);assert.equal(await h.render().moveFromMenu('a',2),false);assert.equal(h.commits.length,0);}
});
test('an old trip acceptance cannot announce success in a different trip scope',async()=>{
 let release;const h=runner({commit:()=>new Promise(r=>{release=r})});h.options.scopeKey='trip-a';h.render();const pending=h.render().moveFromMenu('a',1);h.options.scopeKey='trip-b';h.render();assert.equal(h.render().announcement,'');release(true);await pending;assert.doesNotMatch(h.render().announcement,/moved/);
});
test('a gesture cannot be dropped into a new trip with the same stop IDs',async()=>{
 const h=runner();h.options.scopeKey='a';h.render();h.pointer('onPointerDown');h.setHit(1);h.pointer('onPointerMove');h.options.scopeKey='b';h.render();await h.pointer('onPointerUp');assert.equal(h.commits.length,0);
});
test('Escape does not claim to cancel a submitted acceptance',async()=>{
 let release;const h=runner({commit:()=>new Promise(r=>{release=r})});const pending=h.render().moveFromMenu('a',1);h.render().gripProps('a').onKeyDown({key:'Escape',preventDefault(){}});assert.doesNotMatch(h.render().announcement,/cancelled/i);release(true);await pending;
});
test('menu completion restores its own focus, but never steals focus from another input',async()=>{
 for(const focusMoved of [false,true]){
  const h=runner();assert.equal(typeof h.exports.completeBuilderMenuMove,'function');let release,focused=false;
  const summary={focus(){focused=true}},button={closest:()=>details},other={};
  const details={open:true,isConnected:true,contains:value=>value===button,querySelector:()=>summary};h.document.activeElement=button;
  const pending=h.exports.completeBuilderMenuMove(button,()=>new Promise(r=>{release=r}),()=>true);
  if(focusMoved)h.document.activeElement=other;release(true);await pending;assert.equal(focused,!focusMoved);
 }
});
