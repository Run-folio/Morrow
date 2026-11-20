import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const compiled=(await build({
  stdin:{contents:'export * from "./components/easyt/app-motion";',resolveDir:process.cwd()},
  bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',packages:'external',
  plugins:[{name:'cue-hooks',setup(b){
    b.onResolve({filter:/^react$|\.module\.css$/},args=>({path:args.path,namespace:'stubs'}));
    b.onLoad({filter:/.*/,namespace:'stubs'},args=>({contents:args.path==='react'
      ?'export const forwardRef=f=>f, Children={}, useRef=()=>{}, useState=(...a)=>hooks.useState(...a), useEffect=(...a)=>hooks.useEffect(...a), useCallback=f=>f;'
      :'export default {}'}));
  }}],
})).outputFiles[0].text;

test('cues identify only the last accepted occurrence, do not replay across scopes, and expire', () => {
  let value, cleanup, lastDeps, nextEffect;
  const hooks={
    useState(initial){value??=initial;return [value,fn=>{value=typeof fn==='function'?fn(value):fn}]},
    useEffect(fn,deps){if(lastDeps?.every((value,i)=>value===deps[i]))return;lastDeps=deps;nextEffect=fn},
  };
  const timeouts=new Map();let count=0;
  const module={exports:{}};
  vm.runInNewContext(compiled,{module,exports:module.exports,require,hooks,window:{
    setTimeout(fn){timeouts.set(++count,fn);return count},clearTimeout(id){timeouts.delete(id)}
  }});
  const render=scope=>{
    const output=module.exports.useAcceptedMotionCue(scope);
    if(nextEffect){cleanup?.();cleanup=nextEffect();nextEffect=undefined;}
    return output;
  };
  assert.equal(typeof module.exports.useAcceptedMotionCue,'function');
  assert.equal(render('trip-a').cue,null);
  render('trip-a').markAccepted('repeated-Tokyo-2');
  const first=render('trip-a').cue;
  assert.equal(first.targetId,'repeated-Tokyo-2');
  render('trip-a').markAccepted('repeated-Tokyo-2');
  const second=render('trip-a').cue;
  assert.notEqual(first.version,second.version);
  assert.equal(render('different-trip').cue,null);
  for(const fn of [...timeouts.values()])fn();
  assert.equal(render('trip-a').cue,null);
});
