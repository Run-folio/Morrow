import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import {easytCopy} from '../lib/easyt/i18n.ts';
import {tripDisplayTitle} from '../lib/easyt/trip-display.ts';

// Exercise the actual existing menu in isolation; callbacks only record intent.
// No mounted dashboard, account request, browser storage or saved trip is used.
const source=readFileSync(new URL('../app/journey/dashboard/dashboard-client.tsx',import.meta.url),'utf8');
const file=ts.createSourceFile('dashboard-client.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declaration=file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='TripActionsMenu');
assert.ok(declaration,'production TripActionsMenu exists');
const require=createRequire(import.meta.url),Button=()=>null,Link=()=>null;
const scope={EasyTButton:Button,Link,tripDisplayTitle,trackTripReopened:()=>{},styles:{tripMenu:'menu',deleteAction:'delete'},
  ...Object.fromEntries(['Archive','RotateCcw','Copy','Gift','Trash2','MoreHorizontal','CalendarCheck2'].map(name=>[name,()=>null]))};
const js=ts.transpileModule(declaration.getText(file)+'\nexport {TripActionsMenu};',{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{} as {TripActionsMenu?:(props:any)=>any}};
new Function('require','module','exports','scope',`with(scope){${js}}`)(require,module,module.exports,scope);
const menu=module.exports.TripActionsMenu!;
function flatten(node:any):any[]{return !node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(flatten):[node,...flatten(node.props?.children)];}
function text(node:any):string{return node==null?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);}
function render(status:'draft'|'planned'|'archived',language:'en'|'es'='en',working=false,workingAction:string|null=null){
  const trip={id:'synthetic-menu-trip',ownerId:'synthetic-owner',title:'Traveller title',status,brief:{origin:'London',customTitle:'Traveller title'},stops:[]};
  const intents:any[]=[];
  const tree=menu({trip,language,copy:easytCopy[language].dashboard,working,workingAction,
    onAction:(id:string,action:string)=>intents.push([action,id]),onGift:(value:unknown)=>intents.push(['gift',value]),onRemove:(value:unknown)=>intents.push(['confirm-delete',value])});
  return{trip,intents,tree,nodes:flatten(tree),buttons:flatten(tree).filter(node=>node.type===Button)};
}

for(const language of ['en','es']as const)for(const status of ['draft','planned','archived']as const)test(`${language} ${status} Trips menu offers only supported lifecycle,copy,gift and delete actions`,()=>{
  const h=render(status,language),copy=easytCopy[language].dashboard;
  assert.deepEqual(h.buttons.map(text),[status==='archived'?copy.restore:copy.archive,copy.duplicate,copy.gift,copy.delete]);
  assert.equal(h.nodes.some(node=>node.type===Link||node.props?.href),false,'Trip mode must not remain as a menu navigation dead end');
  assert.ok(h.nodes.find(node=>node.type==='summary').props['aria-label'].includes('Traveller title'));
});

test('existing lifecycle,gift and delete-confirmation callbacks retain their exact trip targets',()=>{
  for(const status of ['planned','archived']as const){
    const h=render(status),before=JSON.stringify(h.trip);
    for(const button of h.buttons)button.props.onClick();
    assert.deepEqual(h.intents,[[status==='archived'?'restore':'archive',h.trip.id],['duplicate',h.trip.id],['gift',h.trip],['confirm-delete',h.trip]]);
    assert.equal(JSON.stringify(h.trip),before);
  }
});

test('all retained menu actions remain disabled while an operation is in flight',()=>{
  for(const [status,action]of [['planned','archive'],['archived','restore'],['planned','duplicate']]as const){
    const h=render(status,'en',true,action);
    assert.ok(h.buttons.every(button=>button.props.disabled===true));
    assert.deepEqual(h.intents,[]);
    assert.ok(h.buttons.some(button=>/Archiving|Restoring|Duplicating/.test(text(button))));
  }
});
