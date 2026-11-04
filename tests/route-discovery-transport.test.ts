import assert from "node:assert/strict";
import test from "node:test";
import { discoveryCharacter, discoveryStyles, filterDiscoveryRoutes, initialDiscoveryFilters } from "../lib/easyt/route-discovery.ts";
import { publicRoutePublishedFamilies } from "../lib/easyt/public-route.ts";
import type { RouteFamily } from "../lib/easyt/route-catalog.ts";
const routes = publicRoutePublishedFamilies();
const japan = routes.find(r => r.key === "japan-slow")!;
const classify = (patch: Partial<RouteFamily>) => discoveryCharacter({...japan,...patch});
test("complete planning modes produce only the three supported transport labels", () => {
  assert.equal(discoveryCharacter(japan), "Rail-focused");
  assert.equal(discoveryCharacter(routes.find(r=>r.key === "portugal-atlantic")!), "By road");
  assert.equal(discoveryCharacter(routes.find(r=>r.key === "balkans-overland")!), "By road");
  assert.equal(discoveryCharacter(routes.find(r=>r.key === "japan-south-korea")!), "Mixed transport");
  assert.equal(classify({connections:japan.connections.map((c,i)=>({...c,mode:i%2?"bus":"road"}))}), "By road");
});
test("incomplete, duplicate, non-adjacent, reversed and unsupported connection records omit the label", () => {
  assert.equal(classify({connections:[]}), null);
  assert.equal(classify({connections:japan.connections.slice(1)}), null);
  assert.equal(classify({connections:[...japan.connections,japan.connections[0]]}), null);
  assert.equal(classify({connections:[japan.connections[0],japan.connections[0],...japan.connections.slice(2)]}), null);
  assert.equal(classify({connections:japan.connections.map((c,i)=>i?c:{...c,to:japan.stops[2].name})}), null);
  assert.equal(classify({connections:japan.connections.map((c,i)=>i?c:{...c,from:c.to,to:c.from})}), null);
  assert.equal(classify({connections:japan.connections.map(c=>({...c,mode:"unknown" as never}))}), null);
  assert.equal(classify({stops:japan.stops.slice(0,1),connections:[]}), null);
});
test("no transport is inferred from borders, interests, title, duration or authored character", () => {
  for(const route of routes.filter(r=>!r.connections.length)) assert.equal(discoveryCharacter(route),null,route.key);
  assert.equal(classify({countries:["Japan","Korea"],interests:["rail"],character:"Self-drive",connections:[]}),null);
  assert.equal(classify({connections:japan.connections.map(c=>({...c,mode:"ferry"}))}),null);
});
test("all public routes retain identity and transport coverage follows full ordered records", () => {
  const counts = new Map<string|null,number>();
  for(const route of routes){const label=discoveryCharacter(route);counts.set(label,(counts.get(label)??0)+1);}
  assert.deepEqual(Object.fromEntries(counts),{"Rail-focused":3,"Mixed transport":5,"By road":4,"null":13});
});
test("interests remain independent and unsupported slow/legacy values recover without fake pacing", () => {
  assert.equal(discoveryStyles.some(([key])=>String(key)==="slow"),false);
  for(const interest of ["food","rail","nature","coast","culture","heritage"] as const)
    assert.deepEqual(filterDiscoveryRoutes(routes,{...initialDiscoveryFilters,style:interest}),routes.filter(r=>r.interests.includes(interest)));
  for(const style of ["slow","unknown"] as const)
    assert.deepEqual(filterDiscoveryRoutes(routes,{...initialDiscoveryFilters,style:style as never}),routes);
});
test("repeated stop names preserve ordered occurrence evidence", () => {
  const stops=[japan.stops[0],japan.stops[1],{...japan.stops[0]},japan.stops[2]];
  const connections=stops.slice(1).map((to,i)=>({...japan.connections[0],from:stops[i].name,to:to.name}));
  assert.equal(classify({stops,connections}),"Rail-focused");
  assert.equal(classify({stops,connections:[connections[2],connections[1],connections[0]]}),null);
  assert.equal(classify({stops,connections:[connections[0],connections[1],connections[0]]}),null);
});
