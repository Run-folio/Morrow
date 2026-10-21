import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const project=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(project.replace(/\/?$/,'/')+'package.json');
const {build}=require('esbuild');
const script=(await build({stdin:{contents:"export {CanonicalPlaceAutocomplete} from './components/easyt/canonical-place-autocomplete.tsx'; export {HomeDestinationEditor} from './app/journey/home/home-destination-editor.tsx';",resolveDir:project,loader:'tsx'},
 bundle:true,write:false,outfile:'owned-autocomplete.cjs',format:'cjs',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty','.module.css':'empty'},
 plugins:[{name:'owned-react-hook-runner',setup(builder){
  builder.onResolve({filter:/^react$/},()=>({path:'react',namespace:'owned-hooks'}));
  builder.onLoad({filter:/.*/,namespace:'owned-hooks'},()=>({contents:"export const forwardRef=f=>globalThis.__hooks.forwardRef(f);export const useState=(...a)=>globalThis.__hooks.useState(...a);export const useRef=(...a)=>globalThis.__hooks.useRef(...a);export const useMemo=(f)=>f();export const useEffect=(...a)=>globalThis.__hooks.useEffect(...a);export const useId=()=> 'owned-list';export const useDeferredValue=v=>v;"}));
 }}],define:{'process.env.NODE_ENV':'"test"'}})).outputFiles[0].text;
function allElements(node,out=[]){if(!node||typeof node!=='object')return out;if(Array.isArray(node)){for(const item of node)allElements(item,out);return out;}if(node.props){out.push(node);allElements(node.props.children,out);}return out;}
function text(node){if(node===null||node===undefined||typeof node==='boolean')return '';if(typeof node==='string'||typeof node==='number')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children);}
/** Executes the actual component body/effect and returned option handlers. React
 * scheduling and native DOM are substituted; never a browser/hydration proof. */
export function autocompleteRender(query,{api=async()=>({status:200,body:{candidates:[]}}),searchIntent='route-stop',contextCountries}={}){
 const values=[],refs=[],effects=[],timers=new Map(),selected=[],calls=[];let timerId=0;let stateIndex=0,refIndex=0,effectIndex=0;
 const hooks={forwardRef:require('react').forwardRef,useState(initial){const at=stateIndex++;if(!(at in values))values[at]=typeof initial==='function'?initial():initial;return [values[at],next=>{values[at]=typeof next==='function'?next(values[at]):next;}];},
  useRef(initial){const at=refIndex++;return refs[at]??(refs[at]={current:initial});},
  useEffect(callback,deps){const at=effectIndex++,prior=effects[at];if(prior&&deps?.every((value,index)=>Object.is(value,prior.deps?.[index])))return;prior?.cleanup?.();effects[at]={deps,callback};}};
 const module={exports:{}};
 const context=vm.createContext({module,exports:module.exports,require,console,URL,URLSearchParams,AbortController,AbortSignal,DOMException,setTimeout,clearTimeout,process:{env:{NODE_ENV:'test'}},__hooks:hooks,
  window:{setTimeout(callback){const id=++timerId;timers.set(id,callback);return id;},clearTimeout(id){timers.delete(id);}},document:{activeElement:null},
  fetch:async(url)=>{const parsed=new URL(url,'http://127.0.0.1:43189');calls.push(parsed);const response=await api({pathname:parsed.pathname,method:'GET',searchParams:parsed.searchParams});return {ok:response.status>=200&&response.status<300,status:response.status,json:async()=>JSON.parse(JSON.stringify(response.body))};}});
 new vm.Script(script,{filename:'actual-autocomplete-bundle.cjs'}).runInContext(context);
 let tree;
 let props={label:'Synthetic destination',placeholder:'Place',value:query,includeNonRoutable:true,contextCountries,searchIntent,onChange(){},onSelect:suggestion=>selected.push(suggestion)};
 const render=(overrides={})=>{props={...props,...overrides};stateIndex=0;refIndex=0;effectIndex=0;tree=module.exports.CanonicalPlaceAutocomplete(props);
  for(const effect of effects)if(effect.callback){const callback=effect.callback;effect.callback=null;effect.cleanup=callback();}return tree;};
 render();allElements(tree).find(node=>node.props.role==='combobox').props.onFocus();render();
 return {selected,calls,render,async settle(){const pending=[...timers.values()];timers.clear();for(const timer of pending)timer();for(let i=0;i<40;i++)await Promise.resolve();render();},
  rows(){return allElements(tree).filter(node=>node.props.role==='option').map(node=>({key:node.key,label:text(node),choose:()=>node.props.onClick()}));},
  close(){for(const effect of effects)effect.cleanup?.();}};
}

/** Runs the actual homepage editor selection callback; transport/storage are not involved. */
export function selectHomepageEntry(selection, id='synthetic-entry') {
 let entries=[{id,text:selection.name,selection:null}];
 const hooks={forwardRef:require('react').forwardRef,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useRef:initial=>({current:initial}),useEffect(){}};
 const module={exports:{}};
 const context=vm.createContext({module,exports:module.exports,require,console,URL,URLSearchParams,AbortController,AbortSignal,DOMException,setTimeout,clearTimeout,process:{env:{NODE_ENV:'test'}},__hooks:hooks});
 new vm.Script(script,{filename:'actual-home-editor-bundle.cjs'}).runInContext(context);
 const tree=module.exports.HomeDestinationEditor({entries,language:'en',onChange:next=>{entries=next;}});
 const tags=allElements(tree).filter(node=>node.props.editor);
 const autocomplete=tags.flatMap(node=>allElements(node.props.editor)).find(node=>node.type?.name==='CanonicalPlaceAutocomplete');
 if(!autocomplete)throw new Error('Actual homepage autocomplete callback missing');
 autocomplete.props.onSelect(selection);return entries[0];
}
