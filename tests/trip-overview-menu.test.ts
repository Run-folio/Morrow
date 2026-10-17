import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {easytCopy} from '../lib/easyt/i18n.ts';
import {ownerBoundaryState} from '../lib/easyt/private-browser-context.ts';

const require=createRequire(import.meta.url),Button=()=>null,Launcher=()=>null;
function flatten(node:any):any[]{return !node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(flatten):[node,...flatten(node.props?.children)];}
function text(node:any):string{return node==null?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);}
function render({ownerId='owner-a',sessionId='owner-a',pending=false,status='planned',failure=null,recoveryReady=true,historicalRecovery=false,isAccountCopySettled}:any={}){
  const trip={id:'fixture-trip',ownerId,status},calls:any[]=[],actions={working:null,actionNotice:null,actionError:'',openGift:(value:any)=>calls.push(['gift',value]),requestDelete:(value:any)=>calls.push(['confirm-delete',value]),runAction:(id:string,action:string)=>calls.push([action,id])};let options:any;
  const mutation={trip,failure,recoveryReady,historicalRecovery,saveState:'idle',hasPendingSaves:()=>pending,isAccountCopySettled:isAccountCopySettled??(()=>recoveryReady&&!failure&&!historicalRecovery&&!pending&&Boolean(ownerId))};
  const imports:any={react:{useState:(initial:any)=>[initial,()=>{}],useEffect:()=>{},useRef:(value:any)=>({current:value})},'next/navigation':{useRouter:()=>({refresh:()=>{},replace:()=>{}}),usePathname:()=>'/journey/fixture-trip'},'@/lib/auth-client':{authClient:{useSession:()=>({data:sessionId?{user:{id:sessionId}}:null,isPending:false})}},'@/lib/easyt/i18n':{easytCopy},'@/lib/easyt/storage':{},'@/lib/easyt/private-browser-context':{ownerBoundaryState},'@/lib/easyt/trip-continuity':{},'./easyt-controls':{EasyTButton:Button},'./morrovia-feedback':{},'./workspace-orientation':{WorkspaceOrientationLauncher:Launcher},'./trip-library-action-dialogs':{TripLibraryActionDialogs:()=>null},'./use-trip-library-actions':{useTripLibraryActions:(value:any)=>{options=value;return actions;}}};
  const source=readFileSync(new URL('../components/easyt/trip-overview-library-actions.tsx',import.meta.url),'utf8'),js=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module={exports:{}as any};new Function('require','module','exports',js)((id:string)=>imports[id]??require(id),module,module.exports);
  const tree=module.exports.TripOverviewLibraryActions({mutation,onRenameTrip:()=>{}}),launcher=flatten(tree).find(n=>n.type===Launcher);let closed=0;
  const items=launcher.props.renderTripActions?.(()=>{closed++;});
  return{trip,launcher,options,calls,items,nodes:flatten(items),buttons:flatten(items).filter(n=>n.type===Button),closed:()=>closed};
}
test('Overview reuses More and retains Rename while exposing Gift,Duplicate,Archive and separated Delete',()=>{
  const h=render();assert.equal(typeof h.launcher.props.onRenameTrip,'function');assert.deepEqual(h.buttons.map(text),['Gift this trip','Duplicate','Archive','Delete']);const separator=h.nodes.findIndex(n=>n.type==='hr');const deleteIndex=h.nodes.findIndex(n=>n.type===Button&&text(n)==='Delete');assert.ok(separator>=0&&separator<deleteIndex);assert.equal(h.buttons.at(-1).props.variant,'danger');for(const button of h.buttons)button.props.onClick();assert.deepEqual(h.calls,[['gift',h.trip],['duplicate',h.trip.id],['archive',h.trip.id],['confirm-delete',h.trip]]);assert.equal(h.closed(),4);
});
test('archived Overview preserves the existing Restore action',()=>{assert.deepEqual(render({status:'archived'}).buttons.map(text),['Gift this trip','Duplicate','Restore','Delete']);});
test('guest Overview retains More but exposes no account actions',()=>{const h=render({ownerId:null,sessionId:null});assert.equal(h.launcher.props.renderTripActions,undefined);assert.equal(typeof h.launcher.props.onRenameTrip,'function');assert.equal(h.calls.length,0);});
for(const state of [{sessionId:'owner-b'},{sessionId:null},{pending:true},{recoveryReady:false},{failure:'recovery'},{historicalRecovery:true}])test(`Overview prevents account actions for ${JSON.stringify(state)}`,()=>{const h=render(state);assert.ok(h.buttons.every(button=>button.props.disabled));for(const button of h.buttons)button.props.onClick();assert.equal(h.calls.length,0);});
test('Overview save boundary requires the exact current owned trip and refuses failed pending work',async()=>{
  assert.equal(await render().options.beforeAction(),true);
  assert.equal(await render({isAccountCopySettled:()=>false}).options.beforeAction(),false);
  assert.equal(await render({recoveryReady:false}).options.beforeAction(),false);
});
