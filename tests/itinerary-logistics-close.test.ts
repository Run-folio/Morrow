import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import postcss from 'postcss';

const source=readFileSync('components/easyt/trip-itinerary-workspace.tsx','utf8');
const ast=ts.createSourceFile('itinerary.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declaration=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='ItineraryLogisticsDetail');assert(declaration);
const javascript=ts.transpileModule(`${declaration.getText(ast)};return ItineraryLogisticsDetail;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
function render(language='en'){
 let closed=0;
 const deps={React:{Fragment:'fragment',createElement:(type:unknown,props:any,...children:unknown[])=>({type,props:{...props,children:children.flat(Infinity)}})},
  useRef:()=>({current:null}),useState:()=>[false,()=>{}],useEffect:()=>{},
  itineraryCopy:()=>({cancel:'Cancel',transportDetails:'Transfer',details:'Details',booking:'Booking',savedBookingDetails:'Saved details',openTransport:'Open Transport workspace'}),
  styles:new Proxy({},{get:(_target,key)=>String(key)}),EasyTButton:'button',EasyTLinkButton:'a',X:'x',Route:'route',ExternalLink:'external',
  transportWorkspaceHref:()=>'/transport'};
 const component=new Function(...Object.keys(deps),javascript)(...Object.values(deps));
 const tree=component({trip:{id:'public-fixture'},language,booking:{title:'Public test transfer',type:'transport'},onClose:()=>closed++});
 const all=(node:any):any[]=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(all):[node,...all(node.props?.children)];
 return {nodes:all(tree),closed:()=>closed};
}
test('inline transport inspector close is visible while calendar dialog keeps its header close',()=>{
 const css=postcss.parse(readFileSync('components/easyt/trip-itinerary-workspace.module.css','utf8'));
 const hidden=(presentation:string)=>{let result=false;css.walkRules(rule=>{
  if(rule.parent?.type!=='root'||!rule.selector.includes('.calendarItemDialog')||!rule.selector.includes('.logisticsDetailClose'))return;
  const required=rule.selector.match(/data-dialog-presentation="([^"]+)"/)?.[1];
  if(!required||required===presentation)rule.walkDecls('display',decl=>{if(decl.value==='none')result=true;});
 });return result;};
 assert.equal(hidden('inline'),false);assert.equal(hidden('modal'),true);
});
test('transport close uses the existing dismiss callback with an accessible Close label',()=>{
 for(const [language,label] of [['en','Close details for Public test transfer'],['es','Cerrar detalles de Public test transfer']]){
  const view=render(language),button=view.nodes.find(node=>node.type==='button'&&node.props.className==='logisticsDetailClose');assert(button);
  assert.equal(button.props['aria-label'],label);button.props.onClick();assert.equal(view.closed(),1);
 }
});
test('existing detail dismiss restores origin focus and saved scroll without navigation',()=>{
 let init:ts.Expression|undefined;function visit(node:ts.Node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='closeSelectedDetail')init=node.initializer;ts.forEachChild(node,visit);}visit(ast);assert(init);
 const body=ts.transpileModule(`return (${init.getText(ast)});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const calls:string[]=[],origin={focus:()=>calls.push('focus')},selectedItemOriginRef={current:origin as unknown},detailScrollRef={current:{surface:{scrollTo:()=>calls.push('surface')},top:42,page:84} as unknown};
 const deps={useCallback:(fn:()=>void)=>fn,setSelectedItemId:()=>calls.push('clear-item'),setSelectedRecommendation:()=>calls.push('clear-recommendation'),selectedItemOriginRef,calendarSurfaceRef:{current:null},detailScrollRef,window:{requestAnimationFrame:(fn:()=>void)=>fn(),scrollTo:()=>calls.push('page')}};
 const close=new Function(...Object.keys(deps),body)(...Object.values(deps));close();
 assert.deepEqual(calls,['clear-item','clear-recommendation','focus','surface','page']);assert.equal(selectedItemOriginRef.current,null);assert.equal(detailScrollRef.current,null);
});
test('restaurant, activity and stay details share the same existing nonembedded Close control',()=>{
 const detail=readFileSync('components/easyt/itinerary-item-detail.tsx','utf8');
 assert.match(detail,/!embedded \? <>[\s\S]*?aria-label=\{`Close details for \$\{detail.title\}`\}/);
 assert.match(detail,/detail.kind === "restaurant"/);assert.match(detail,/detail.kind === "accommodation"/);
});
