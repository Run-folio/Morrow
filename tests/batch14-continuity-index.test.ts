import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeRouteCountryContinuity, classifyCountryContinuity, createCountryContinuityClassifier } from '../lib/easyt/route-country-continuity.ts';
const stop=(id:string,country:string)=>({id,name:id,country});
function permutations<T>(items:T[]):T[][] { return items.length<2?[items]:items.flatMap((item,index)=>permutations(items.filter((_,i)=>i!==index)).map(rest=>[item,...rest])); }
test('indexed classification exactly matches the independent scan for all six-stop permutations and unknown-country barriers',()=>{
 for(const countries of [['Japan','South Korea','South Korea','Morocco','Morocco','Morocco'],['Japan','unknown','Japan','Morocco','unknown','Morocco']]){
  const routes=permutations(countries.map((country,index)=>stop(`occurrence:${index}`,country))).map(analyzeRouteCountryContinuity);
  const classify=createCountryContinuityClassifier(routes);
  for(const route of routes)assert.deepEqual(classify(route),classifyCountryContinuity({route,viableAlternatives:routes}));
 }
});
test('per-evaluation index preserves proof evidence and snapshots alternatives without a global stale cache',()=>{
 const route=analyzeRouteCountryContinuity([stop('a','Japan'),stop('x','China'),stop('b','Japan')]);
 const alternatives=[route],proofs=[{countryCode:'JP',kind:'authoritative-protected-order' as const,provenReentryCount:1,stopIds:['a','x','b'],constraintIds:['manual-order']}];
 const classify=createCountryContinuityClassifier(alternatives);
 assert.deepEqual(classify(route,proofs),classifyCountryContinuity({route,viableAlternatives:alternatives,proofs}));
 alternatives.push(analyzeRouteCountryContinuity([stop('a','Japan'),stop('b','Japan'),stop('x','China')]));
 assert.equal(classify(route,proofs)[0]!.status,'proven-constraint-driven');
 assert.equal(createCountryContinuityClassifier(alternatives)(route,proofs)[0]!.status,'avoidable');
});
