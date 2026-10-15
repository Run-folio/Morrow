// Test-only observation for the unresolved Japan1440 module-load failure.
// No request routing, retries, cache cleanup or application-state access.
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

export function diagnosticLocation(raw,origin) {
  try {
    const url=new URL(raw,origin);
    if(url.origin!==origin)return {scope:'external',path:'[external]'};
    let path=url.pathname.replace(/\/trip-[^/]+/g,'/:trip');
    if(!(/^\/_next\/static\/[A-Za-z0-9_/%.[\]()-]+$/.test(path)
      || /^\/easyt-(sw|offline-manifest|offline-dependencies)\.js$/.test(path)
      || /^\/$|^\/journey\/(?:new|plan|:trip(?:\/(?:itinerary|map|explore|stay|transport))?)$/.test(path)))path='[other-local-path]';
    return {scope:'app',path};
  }catch{return {scope:'unknown',path:'[invalid]'};}
}

export function createDiagnosticTimeline(limit=3000) {
  const events=[];let dropped=0;const start=Date.now();
  return {record(kind,data){if(events.length===limit){events.shift();dropped++;}events.push({kind,atHostMs:Date.now()-start,...data});},
    snapshot(){return {events:[...events],dropped};}};
}

export function boundedDiagnosticResult(promise,timeoutMs=1000) {
  return new Promise(resolve=>{
    const timer=setTimeout(()=>resolve({status:'timeout'}),timeoutMs);
    Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve({status:'complete',value});},error=>{
      clearTimeout(timer);resolve({status:'error',errorName:/^[A-Za-z]{1,40}$/.test(error?.name)?error.name:'unknown'});
    });
  });
}

// Serialized into the existing worker's JS context by Playwright. Native calls
// keep their receiver, arguments, promise identity and original error object.
export function installJapanWorkerProbe() {
  const scope=globalThis;
  if(scope.__morroviaJapanWorkerDiagnostics)return;
  const data={events:[],dropped:0,capabilities:{}};
  scope.__morroviaJapanWorkerDiagnostics=data;
  const emit=(kind,details={})=>{if(data.events.length===1000){data.events.shift();data.dropped++;}data.events.push({kind,atEpochMs:Date.now(),...details});};
  const selected=(input)=>{
    try {const u=new URL(typeof input==='string'?input:input.url,scope.location.origin);
      return u.origin===scope.location.origin&&/^\/_next\/static\/chunks\/(?:app\/journey\/(?:%5BtripId%5D|\[tripId\])\/(?:layout|loading)-|(?:5589|638|5077|7349|1335)-)[A-Za-z0-9_.-]+\.js$/i.test(u.pathname)?u.pathname:null;
    }catch{return null;}
  };
  const cacheNames=new WeakMap();
  function observe(target,key,kind,select,details) {
    const original=target?.[key];data.capabilities[kind]=typeof original==='function';
    if(typeof original!=='function')return;
    target[key]=function(...args){
      const picked=select(args,this);
      if(!picked)return Reflect.apply(original,this,args);
      emit(kind+'-start',picked);
      try {
        const result=Reflect.apply(original,this,args);
        const ok=value=>{try{emit(kind+'-result',{...picked,...details(value,args,this)});}catch{emit('probe-observation-error',{stage:kind});}};
        const rejected=error=>emit(kind+'-rejected',{...picked,errorName:typeof error?.name==='string'?error.name:'unknown'});
        if(result&&typeof result.then==='function')result.then(ok,rejected);else ok(result);
        return result;
      }catch(error){emit(kind+'-threw',{...picked,errorName:typeof error?.name==='string'?error.name:'unknown'});throw error;}
    };
  }
  const assetPick=args=>{const path=selected(args[0]);return path?{path}:null;};
  observe(scope,'fetch','fetch',assetPick,r=>({status:r.status,ok:r.ok,type:r.type}));
  observe(scope.CacheStorage?.prototype,'open','cache-open',args=>typeof args[0]==='string'&&args[0].startsWith('easyt-public-shell-')?{cache:args[0]}:null,(cache,args)=>{cacheNames.set(cache,args[0]);return {};});
  observe(scope.CacheStorage?.prototype,'match','previous-cache-match',assetPick,r=>({hit:Boolean(r),status:r?.status??null}));
  observe(scope.Cache?.prototype,'match','cache-match',(args,cache)=>{const path=selected(args[0]);return path?{path,cache:cacheNames.get(cache)??'unobserved-open'}:null;},r=>({hit:Boolean(r),status:r?.status??null}));
  observe(scope.Cache?.prototype,'put','cache-put',assetPick,()=>({}));
  observe(scope,'exactAsset','digest',args=>{const path=selected(args[1]?.url);return path?{path}:null;},r=>({exact:r}));
  observe(scope,'skipWaiting','skip-waiting',()=>({}),()=>({}));
  observe(scope.clients,'claim','clients-claim',()=>({}),()=>({}));
  for(const kind of ['install','activate'])scope.addEventListener(kind,()=>emit('worker-'+kind));
  scope.addEventListener('fetch',event=>{const path=selected(event.request.url);if(path)emit('fetch-event',{path,mode:event.request.mode,destination:event.request.destination,cache:event.request.cache,clientId:event.clientId??null,resultingClientId:event.resultingClientId??null});});
  const m=scope.MORROVIA_OFFLINE_SHELL;
  emit('probe-installed',{readerFloor:m?.readerFloor,buildCommit:m?.buildCommit,artifactId:m?.artifactId,assetCount:m?.assets?.length});
}

const attached=new WeakMap();
export function markJapanModuleDiagnostic(page,stage){attached.get(page)?.mark(stage);}

export async function attachJapanModuleDiagnostics(context,page,{base,artifacts,commit}) {
  const origin=new URL(base).origin;
  const timeline=createDiagnosticTimeline();
  const requests=new Map();const workerTasks=[];const workers=[];const gaps=[];
  let requestEvictions=0,gapsDropped=0;
  const addGap=gap=>{if(gaps.length<32)gaps.push(gap);else gapsDropped++;};
  const location=raw=>diagnosticLocation(raw,origin);
  const record=(kind,data={})=>timeline.record(kind,data);
  const safeError=error=>/^[A-Za-z]{1,40}$/.test(error?.name)?error.name:'unknown';
  const requestInfo=id=>requests.get(id)??null;
  const stackFrames=stack=>(stack?.callFrames??[]).slice(0,8).map(frame=>({location:location(frame.url),line:frame.lineNumber,column:frame.columnNumber,functionName:/^[\w.$<> -]{0,80}$/.test(frame.functionName)?frame.functionName:'[other-function]'}));
  let cdp;
  try {
    cdp=await context.newCDPSession(page);
    cdp.on('Network.requestWillBeSent',e=>{
      const loc=location(e.request.url);
      if(loc.scope!=='app'||!(e.type==='Document'||loc.path.startsWith('/_next/static/')||loc.path==='/easyt-sw.js'))return;
      const info={requestId:e.requestId,location:loc,type:e.type,frameId:e.frameId,loaderId:e.loaderId};
      if(requests.size===3000){requests.delete(requests.keys().next().value);requestEvictions++;}requests.set(e.requestId,info);
      record('network-request',{...info,atCdpMs:e.timestamp*1000,atEpochMs:e.wallTime*1000,document:location(e.documentURL),initiator:{type:e.initiator?.type,location:location(e.initiator?.url??''),line:e.initiator?.lineNumber,stack:stackFrames(e.initiator?.stack),parentStack:stackFrames(e.initiator?.stack?.parent)}});
    });
    cdp.on('Network.responseReceived',e=>{const r=requestInfo(e.requestId);if(r)record('network-response',{...r,atCdpMs:e.timestamp*1000,status:e.response.status,fromServiceWorker:e.response.fromServiceWorker??false,fromDiskCache:e.response.fromDiskCache??false,workerSource:e.response.serviceWorkerResponseSource??null,cacheName:e.response.cacheStorageCacheName??null});});
    cdp.on('Network.loadingFailed',e=>{const r=requestInfo(e.requestId);if(r)record('network-failed',{...r,atCdpMs:e.timestamp*1000,error:/^net::ERR_[A-Z0-9_]+$/.test(e.errorText)?e.errorText:'[other-network-error]',cancelled:e.canceled??null,blockedReason:e.blockedReason??null,corsError:e.corsErrorStatus?.corsError??null});requests.delete(e.requestId);});
    cdp.on('Network.loadingFinished',e=>{const r=requestInfo(e.requestId);if(r)record('network-finished',{requestId:e.requestId,atCdpMs:e.timestamp*1000,bytes:e.encodedDataLength});requests.delete(e.requestId);});
    cdp.on('Network.requestServedFromCache',e=>{if(requestInfo(e.requestId))record('network-cache',{requestId:e.requestId});});
    for(const method of ['frameRequestedNavigation','frameScheduledNavigation','frameStartedNavigating'])cdp.on('Page.'+method,e=>record(method,{frameId:e.frameId,loaderId:e.loaderId,location:location(e.url),reason:e.reason,navigationType:e.navigationType,disposition:e.disposition,delay:e.delay}));
    cdp.on('Page.frameNavigated',e=>record('frame-navigated',{frameId:e.frame.id,parentId:e.frame.parentId,loaderId:e.frame.loaderId,location:location(e.frame.url),navigationType:e.type}));
    cdp.on('Page.lifecycleEvent',e=>{if(['init','DOMContentLoaded','load'].includes(e.name))record('page-lifecycle',{name:e.name,frameId:e.frameId,loaderId:e.loaderId,atCdpMs:e.timestamp*1000});});
    cdp.on('ServiceWorker.workerVersionUpdated',e=>{for(const v of e.versions)record('worker-version',{versionId:v.versionId,registrationId:v.registrationId,location:location(v.scriptURL),status:v.status,runningStatus:v.runningStatus,controlledClients:v.controlledClients??[]});});
    cdp.on('ServiceWorker.workerErrorReported',e=>record('worker-error',{versionId:e.errorMessage.versionId,location:location(e.errorMessage.sourceURL),line:e.errorMessage.lineNumber,column:e.errorMessage.columnNumber}));
    await Promise.all(['Network.enable','Page.enable','ServiceWorker.enable'].map(method=>cdp.send(method)));
    await cdp.send('Page.setLifecycleEventsEnabled',{enabled:true});
  }catch(error){addGap({stage:'cdp-setup',errorName:safeError(error)});}
  const observeWorker=worker=>{
    if(location(worker.url()).path!=='/easyt-sw.js')return;
    if(workers.length===4){addGap({stage:'worker-limit',errorName:null});return;}
    workers.push(worker);
    workerTasks.push(worker.evaluate(installJapanWorkerProbe).then(()=>record('worker-probe-attached'),error=>addGap({stage:'worker-probe',errorName:safeError(error)})));
  };
  context.on('serviceworker',observeWorker);for(const worker of context.serviceWorkers())observeWorker(worker);
  try{await context.exposeBinding('__morroviaJapanModuleEvent',(_source,event)=>{
    if(!['document-init','controllerchange','beforeunload','pagehide','script-error','script-added','script-removed'].includes(event?.kind))return;
    record(event.kind,{location:location(event.path),atEpochMs:event.atEpochMs,controlled:Boolean(event.controlled),persisted:Boolean(event.persisted),readyState:['loading','interactive','complete'].includes(event.readyState)?event.readyState:null,script:event.script?location(event.script):undefined});
  });}catch(error){addGap({stage:'binding-setup',errorName:safeError(error)});}
  try{await context.addInitScript(()=>{
    const emit=(kind,extra={})=>{if(typeof globalThis.__morroviaJapanModuleEvent==='function')void globalThis.__morroviaJapanModuleEvent({kind,path:location.href,atEpochMs:Date.now(),controlled:Boolean(navigator.serviceWorker.controller),readyState:document.readyState,...extra}).catch(()=>{});};
    emit('document-init');
    navigator.serviceWorker.addEventListener('controllerchange',()=>emit('controllerchange'));
    addEventListener('beforeunload',()=>emit('beforeunload'));
    addEventListener('pagehide',event=>emit('pagehide',{persisted:event.persisted}));
    addEventListener('error',event=>{if(event.target instanceof HTMLScriptElement)emit('script-error',{script:event.target.src});},true);
    const observeScript=(node,kind)=>{
      const scripts=node instanceof HTMLScriptElement?[node]:node.querySelectorAll?.('script[src]')??[];
      for(const script of scripts){try{const url=new URL(script.src);if(/^\/_next\/static\/chunks\/(?:app\/journey\/(?:%5BtripId%5D|\[tripId\])\/(?:layout|loading)-|(?:5589|638|5077|7349|1335)-)[A-Za-z0-9_.-]+\.js$/i.test(url.pathname))emit(kind,{script:script.src});}catch{/* No non-URL script data is recorded. */}}
    };
    new MutationObserver(rows=>{for(const row of rows){for(const node of row.addedNodes)observeScript(node,'script-added');for(const node of row.removedNodes)observeScript(node,'script-removed');}}).observe(document,{childList:true,subtree:true});
  });}catch(error){addGap({stage:'init-script-setup',errorName:safeError(error)});}
  const result={mark(stage){record('harness-mark',{stage});},
    harnessAbort(url){record('harness-abort',{boundary:'existing-external-provider-block',location:location(url)});},
    async finish(){
      record('harness-mark',{stage:'before-context-close'});
      const workerSnapshots=[];
      mkdirSync(artifacts,{recursive:true});
      const persist=complete=>writeFileSync(join(artifacts,'single-area-Japan-1440-module-diagnostics.json'),JSON.stringify({version:1,diagnosticOnly:true,commit:/^[a-f0-9]{40}$/i.test(commit)?commit:null,platform:process.platform,browserVersion:context.browser()?.version(),collectionComplete:complete,gaps,gapsDropped,requestEvictions,...timeline.snapshot(),workers:workerSnapshots},null,2)+'\n');
      persist(false);
      const installed=await boundedDiagnosticResult(Promise.all(workerTasks),750);
      if(installed.status!=='complete')addGap({stage:'worker-probe-wait',errorName:installed.status});
      for(const worker of workers){const snapshot=await boundedDiagnosticResult(worker.evaluate(()=>globalThis.__morroviaJapanWorkerDiagnostics??null));if(snapshot.status==='complete')workerSnapshots.push(snapshot.value);else addGap({stage:'worker-snapshot',errorName:snapshot.status});}
      if(!workers.length)addGap({stage:'worker-not-observed',errorName:null});
      persist(true);
      attached.delete(page);context.off('serviceworker',observeWorker);if(cdp)await boundedDiagnosticResult(cdp.detach(),250);
    }};
  attached.set(page,result);result.mark('diagnostics-ready');return result;
}
