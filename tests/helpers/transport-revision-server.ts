import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {build} from 'esbuild';
import {syntheticRoad} from '../fixtures/transport-comparison.ts';
import type {RoadRoutingProvider} from '../../lib/easyt/road-routing.ts';
import type {TripLeg} from '../../lib/easyt/trip.ts';
import type {MultimodalResolutionResult} from '../../lib/easyt/multimodal-transfer-resolution.ts';
let loaded:Promise<any>|undefined;
export async function server(){
 assert.ok(existsSync('lib/easyt/transport-comparison-revision.server.ts'),'explicit server comparison requires a revision finalizer');
 loaded??=build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export {finalizeTransportComparisonRevisions} from './lib/easyt/transport-comparison-revision.server.ts';export{compareTransferJourney}from'./lib/easyt/multimodal-transfer-resolution.server.ts';`},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'synthetic-server-boundaries',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'marker',namespace:'synthetic'}));b.onResolve({filter:/road-routing\.server\.ts$/},()=>({path:'provider',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},args=>({loader:'ts',resolveDir:process.cwd(),contents:args.path==='marker'?'':`export {RoadRoutingError} from './lib/easyt/road-routing.ts';export class OpenRouteServiceRoadRoutingProvider {constructor(){return globalThis.__REVISION_SYNTHETIC_PROVIDER__}}`}))}}]}).then(r=>import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64')));
 return loaded;
}
export async function explicit(leg:TripLeg,provider:RoadRoutingProvider=syntheticRoad(),signal:AbortSignal=new AbortController().signal){
 const loaded=await server();
 (globalThis as any).__REVISION_SYNTHETIC_PROVIDER__=provider;
 return loaded.compareTransferJourney(leg,signal) as Promise<MultimodalResolutionResult>;
}
