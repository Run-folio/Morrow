import assert from 'node:assert/strict';
import {existsSync, readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import test from 'node:test';

const endpoint='/api/journey-activity-inventory';
async function guard() {
 const path=resolve('netlify/edge-functions/viator-inventory-guard.ts');
 assert.equal(existsSync(path),true,'the public inventory endpoint needs a native edge guard');
 return import(pathToFileURL(path).href);
}
const matches=(config:any,request:Request)=>{
 const Pattern=(globalThis as any).URLPattern;
 // Model native path compilation's optional trailing slash here. The separate
 // real native-artifact test below verifies this assumption against Netlify.
 const url=new URL(request.url);if(url.pathname.endsWith('/'))url.pathname=url.pathname.slice(0,-1)||'/';
 return (Array.isArray(config.path)?config.path:[config.path]).some((path:string)=>new Pattern({pathname:path}).test(url))
   && (!config.method || (Array.isArray(config.method)?config.method:[config.method]).includes(request.method));
};

// This is a synthetic host enforcer, never a production limiter. The metadata
// supplied here models a trusted host IP/domain. Netlify's real key extraction,
// counting, enforcement delay and 429 representation require hosted acceptance.
function syntheticHost(module:any,origin:(request:Request)=>Promise<Response>) {
 const history=new Map<string,number[]>();let now=0;
 return {
  advance:(ms:number)=>{now+=ms;},
  async request(request:Request,host:{ip:string;domain:string}) {
   if (!matches(module.config,request)) return origin(request);
   const key=JSON.stringify(module.config.rateLimit.aggregateBy.map((part:string)=>host[part as keyof typeof host]));
   const recent=(history.get(key)??[]).filter(time=>time>now-module.config.rateLimit.windowSize*1000);
   if(recent.length>=module.config.rateLimit.windowLimit){
    assert.equal(module.config.rateLimit.action??'rate_limit','rate_limit');
    return new Response('Synthetic host: rate limited',{status:429});
   }
   recent.push(now);history.set(key,recent);
   return module.default(request,{next:()=>origin(request)});
  },
 };
}
test('native guard scopes both exact inventory aliases and all methods, excluding unrelated paths',async()=>{
 const module=await guard();
 for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']){
  for(const path of [endpoint,endpoint+'/',endpoint+'?currency=USD'])assert.equal(matches(module.config,new Request('https://disposable.test'+path,{method})),true,method+' '+path);
  for(const path of ['/', '/api/easyt/trips', '/api/journey-discover',endpoint+'-extra',endpoint+'/product','/prefix'+endpoint])assert.equal(matches(module.config,new Request('https://disposable.test'+path,{method})),false,method+' '+path);
 }
});
test('pass-through preserves the unread request body and the exact downstream response',async()=>{
 const module=await guard(),bytes=new TextEncoder().encode('{"destination":{"name":"Bogotá"},"currency":"GBP"}');
 const request=new Request('https://disposable.test'+endpoint,{method:'POST',headers:{'content-type':'application/json','x-disposable':'preserved'},body:bytes});
 const downstream=new Response('Next response unchanged',{status:202,headers:{'cache-control':'no-store','x-disposable-next':'preserved'}});
 let calls=0;
 const result=await module.default(request,{next:async()=>{
  calls++;assert.equal(request.bodyUsed,false);assert.equal(request.headers.get('x-disposable'),'preserved');
  assert.deepEqual(new Uint8Array(await request.arrayBuffer()),bytes);return downstream;
 }});
 assert.equal(calls,1);assert.equal(result,downstream);assert.equal(await result.text(),'Next response unchanged');
 assert.equal(result.status,202);assert.equal(result.headers.get('x-disposable-next'),'preserved');
});
test('synthetic host consumes native 20/60 policy across aliases and rejects before Next',async()=>{
 const module=await guard();let downstream=0;
 const host=syntheticHost(module,async()=>{downstream++;return new Response(null,{status:204});});
 const trusted={ip:'192.0.2.10',domain:'disposable.test'};
 for(let i=0;i<20;i++)assert.equal((await host.request(new Request('https://disposable.test'+endpoint+(i%2?'/':'')),trusted)).status,204);
 const blocked=new Request('https://disposable.test'+endpoint,{method:'POST',body:'unread body'});
 assert.equal((await host.request(blocked,trusted)).status,429);assert.equal(blocked.bodyUsed,false);assert.equal(downstream,20);
 host.advance(59_999);assert.equal((await host.request(new Request('https://disposable.test'+endpoint),trusted)).status,429);
 host.advance(1);assert.equal((await host.request(new Request('https://disposable.test'+endpoint),trusted)).status,204);
});
test('synthetic host key comes from trusted metadata, not caller forwarding headers',async()=>{
 const module=await guard();let downstream=0;
 const host=syntheticHost(module,async()=>{downstream++;return new Response(null,{status:204});});
 const request=(n:number,domain='disposable.test')=>new Request('https://'+domain+endpoint,{headers:{'x-forwarded-for':`198.51.100.${n}`,'x-nf-client-connection-ip':`198.51.100.${n}`}});
 for(let i=0;i<20;i++)await host.request(request(i),{ip:'192.0.2.10',domain:'disposable.test'});
 assert.equal((await host.request(request(50),{ip:'192.0.2.10',domain:'disposable.test'})).status,429);
 assert.equal((await host.request(request(51),{ip:'192.0.2.11',domain:'disposable.test'})).status,204);
 assert.equal((await host.request(request(52,'other-disposable.test'),{ip:'192.0.2.10',domain:'other-disposable.test'})).status,204);
 assert.equal(downstream,22);
});
test('non-POST traffic shares the scoped host limit and retains Next method handling',async()=>{
 const module=await guard();let downstream=0;
 const host=syntheticHost(module,async request=>{downstream++;return new Response(null,{status:request.method==='POST'?204:405,headers:{allow:'POST'}});});
 const trusted={ip:'192.0.2.10',domain:'disposable.test'};
 for(let i=0;i<20;i++){const response=await host.request(new Request('https://disposable.test'+endpoint,{method:'OPTIONS'}),trusted);assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'POST');}
 assert.equal((await host.request(new Request('https://disposable.test'+endpoint,{method:'POST',body:'{}'}),trusted)).status,429);
 assert.equal((await host.request(new Request('https://disposable.test/api/easyt/trips',{method:'POST'}),trusted)).status,204);assert.equal(downstream,21);
});
test('installed native manifest generator emits path bindings and the host IP/domain traffic rule',{skip:!process.env.MORROVIA_NETLIFY_EDGE_BUNDLER_ROOT},()=>{
 const directory=mkdtempSync(join(tmpdir(),'morrovia-viator-native-manifest-'));
 try {
  execFileSync(process.execPath,['--experimental-strip-types','scripts/verify-viator-netlify-edge.mjs',process.env.MORROVIA_NETLIFY_EDGE_BUNDLER_ROOT!,directory],{stdio:'pipe'});
  const manifest=JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
  const entry=manifest.function_config['viator-inventory-guard'];
  assert.deepEqual(entry.traffic_rules,{action:{type:'rate_limit',config:{rate_limit_config:{window_limit:20,window_size:60,algorithm:'sliding_window'},aggregate:{keys:[{type:'ip'},{type:'domain'}]}}}});
  const routes=manifest.routes.filter((route:any)=>route.function==='viator-inventory-guard');
  for(const path of [endpoint,endpoint+'/'])assert.equal(routes.filter((route:any)=>new RegExp(route.pattern).test(path)).length,1,'each alias must bind exactly once');
  for(const path of ['/', '/api/easyt/trips',endpoint+'/child',endpoint+'-extra',endpoint+'//'])assert.equal(routes.some((route:any)=>new RegExp(route.pattern).test(path)),false);
  assert.equal(manifest.routes.every((route:any)=>!route.methods?.length),true);
 } finally {rmSync(directory,{recursive:true,force:true});}
});
