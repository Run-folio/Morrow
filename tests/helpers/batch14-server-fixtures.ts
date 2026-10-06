import { legacyRouteFixture } from "../fixtures/batch14-route-documents.ts";
export const state: { rows: unknown[][]; calls: unknown[][]; queries: {text:string;values:unknown[]}[] } = {rows:[],calls:[],queries:[]};
export async function saveTripForOwner(...args:unknown[]) {state.calls.push(args);return args[1];}
export async function promoteTripForOwner(...args:unknown[]) {state.calls.push(args);return {trip:args[1],outcome:"promoted"};}
export async function listTripsForOwner(){return [legacyRouteFixture()];}
export async function getTripForOwner(){return legacyRouteFixture();}
export async function archiveTripForOwner(){return legacyRouteFixture();}
export async function restoreTripForOwner(){return legacyRouteFixture();}
export async function duplicateTripForOwner(){return legacyRouteFixture();}
export async function deleteTripForOwner(){}
export async function requireEasyTOwner(){return {id:"owner-a"};}
export function getEasyTDatabase(){
 const query=(parts:TemplateStringsArray,...values:unknown[])=>{state.queries.push({text:parts.join("?"),values});return Promise.resolve(state.rows.shift()??[]);};
 return Object.assign(query,{transaction:async(callback:(tx:typeof query)=>Promise<unknown[]>[])=>Promise.all(callback(query))});
}
