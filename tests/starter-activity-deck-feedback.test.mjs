import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const compiled=(await build({
  entryPoints:['components/easyt/starter-activity-deck.tsx'],bundle:true,write:false,format:'cjs',platform:'node',
  jsx:'automatic',packages:'external',plugins:[{name:'deck-hooks',setup(b){
    b.onResolve({filter:/^react$|^\.\/easyt-controls$|^\.\/morrovia-loading-states$|^\.\/resilient-image$|^\.\/itinerary-activity-state$|\.module\.css$/},
      args=>({path:args.path,namespace:'stubs'}));
    b.onLoad({filter:/.*/,namespace:'stubs'},args=>({contents:({
      react:'export const useState=(...a)=>hooks.useState(...a),useRef=(...a)=>hooks.useRef(...a),useEffect=f=>hooks.useEffect(f),useCallback=f=>f;',
      './easyt-controls':"export const EasyTButton='button'",
      './morrovia-loading-states':"export const MorroviaSectionStatus='section'",
      './resilient-image':"export default 'img'",
      './itinerary-activity-state':"export const itineraryActivityLabels=()=>({save:'Save',saved:'Saved',chooseDay:'Choose day'})",
    })[args.path]??'export default new Proxy({},{get:(_,key)=>key})'}));
  }}],
})).outputFiles[0].text;

function runner({save,reduce=false}){
  const values=[],pending=[];
  let i=0, mounted=false;
  const hooks={
    useState(initial){const n=i++;if(!mounted)values[n]=typeof initial==='function'?initial():initial;return [values[n],value=>{values[n]=typeof value==='function'?value(values[n]):value}]},
    useRef(initial){const n=i++;if(!mounted)values[n]={current:initial};return values[n]},
    useEffect(effect){if(!mounted)pending.push(effect)},
  };
  const timeouts=new Map();let tick=0;
  const module={exports:{}};
  vm.runInNewContext(compiled,{module,exports:module.exports,require,hooks,document:{activeElement:null},
    window:{matchMedia:()=>({matches:reduce})},setTimeout(fn){timeouts.set(++tick,fn);return tick;},clearTimeout:id=>timeouts.delete(id)});
  const props={
    cards:['First place','Second place'].map((title,n)=>({title,id:String(n),state:'available',idea:{id:String(n)}})),
    location:'Kyoto',onDeckSave:save,onUndoDeckSave:async()=>true,onSchedule:()=>true,
  };
  const render=()=>{i=0;const tree=module.exports.default(props);mounted=true;for(const effect of pending.splice(0))effect();return tree};
  function lookup(tree,select){if(Array.isArray(tree))return tree.flatMap(child=>lookup(child,select));if(!tree?.props)return [];return [...(select(tree)?[tree]:[]),...lookup(tree.props.children,select)];}
  const button=label=>lookup(render(),x=>x.type==='button'&&x.props.children===label)[0];
  const status=()=>lookup(render(),x=>x.props.role==='status')[0].props.children.join('');
  const alert=()=>lookup(render(),x=>x.props.role==='alert')[0]?.props.children;
  const flush=()=>{for(const fn of [...timeouts.values()])fn();};
  const activeCard=()=>lookup(render(),x=>x.props.articleRef)[0]?.props.card.title;
  return {button,status,alert,flush,activeCard};
}
const settle=async()=>{for(let i=0;i<4;i++)await Promise.resolve()};

test('a slow swipe-deck save shows pending and announces success before the exit animation completes',async()=>{
  let release,requests=0;
  const deck=runner({save:()=>{requests++;return new Promise(r=>{release=r})}});
  deck.button('Save').props.onClick();
  assert.equal(deck.button('Saving…')?.props['aria-disabled'],true);
  assert.match(deck.status(),/Saving/);
  deck.button('Saving…').props.onClick();
  assert.equal(requests,1);
  release('added');
  await settle();
  assert.match(deck.status(),/Idea saved/);
  assert.equal(deck.activeCard(),'First place','the card itself is still exiting');
  const acceptedStatus=deck.status();
  deck.flush();
  assert.equal(deck.status(),acceptedStatus,'animation completion does not update the live region again');
  assert.match(deck.status(),/Second place/);
  deck.button('Undo').props.onClick();
  await settle();
  assert.match(deck.status(),/Previous idea restored.*First place/);
});

test('a failed save keeps the current card and does not expose Undo for a nonexistent save',async()=>{
  const deck=runner({save:async()=>false});
  deck.button('Save').props.onClick();
  await settle();
  assert.match(deck.alert(),/Couldn’t save/);
  assert.match(deck.status(),/First place/);
  assert.ok(deck.button('Save'));
  assert.equal(deck.button('Undo'),undefined);
});

test('reduced-motion deck completes accepted save without waiting for an animation',async()=>{
  const deck=runner({save:async()=> 'added',reduce:true});
  deck.button('Save').props.onClick();
  await settle();
  assert.match(deck.status(),/Idea saved.*Second place/);
  assert.ok(deck.button('Undo'));
});
