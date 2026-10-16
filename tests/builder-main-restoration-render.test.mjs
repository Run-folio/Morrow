import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{build}=require('esbuild');
const trip=JSON.parse(readFileSync(new URL('./fixtures/main-staging-africa-control.json',import.meta.url),'utf8'));
const bundle=await build({stdin:{contents:"export {TripBuilderRouteWorkspace} from './app/journey/new/trip-builder-route-workspace';export {builderDetailsStatus} from './lib/easyt/builder-planning-status';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom/server','react/jsx-runtime'],loader:{'.css':'empty','.module.css':'empty'},logLevel:'silent',plugins:[{name:'unused-map',setup(b){b.onResolve({filter:/journey-planner-map$/},()=>({path:'map',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const JourneyPlannerMap=()=>null'}));}}]});
const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports);
function render(assessments){const noop=()=>{};return renderToStaticMarkup(React.createElement(module.exports.TripBuilderRouteWorkspace,{canonicalTrip:trip,transferAssessments:assessments,previewStopIds:null,selectedStopId:null,lockedStopIds:[],fixedOrder:false,routeCheckProposalStopIds:null,nightStatus:{complete:true,total:6,allocated:6,language:'en'},onSelectStop:noop,onPreviewOrder:noop,onCommitOrder:()=>false,onEditNights:noop,onRemoveStop:noop,onTransportChoiceChange:noop}));}
test('actual Builder rows retain four planning flights and one unresolved connection with and without completed feedback',()=>{
 const before=JSON.stringify(trip);
 for(const assessments of [undefined,trip.legs.map(leg=>({legId:leg.id,state:{retrieval:'completed',evidence:'insufficient',retryable:false}}))]){
  const html=render(assessments);assert.equal((html.match(/ · Flight<\/strong>/g)??[]).length,4);
  assert.equal((html.match(/Transport needs checking\./g)??[]).length,0);
  assert.match(html,/15h 45m/);assert.match(html,/6h 15m/);assert.match(html,/From Windhoek · Transfer needs checking/);
  assert.equal(module.exports.builderDetailsStatus(trip,'en',assessments).label,'Details up to date');
 }
 assert.equal(JSON.stringify(trip),before);
});
test('actual prior-flight row retains a real blocked or checking result',()=>{
 for(const retrieval of ['unavailable','checking']){
  const html=render([{legId:trip.legs[0].id,state:{retrieval,evidence:'insufficient',reason:'configuration_unavailable',retryable:false}}]);
  assert.match(html,retrieval==='checking'?/Checking transport options…/:/Transport check unavailable/);
  assert.notEqual(module.exports.builderDetailsStatus(trip,'en',[{legId:trip.legs[0].id,state:{retrieval,evidence:'insufficient',retryable:false}}]).state,'saved');
 }
});
