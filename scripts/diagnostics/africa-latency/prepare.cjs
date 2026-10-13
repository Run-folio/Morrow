// Generates disposable measurement copies. No application source is committed.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),ts=require('typescript');
const root=path.resolve(process.argv[2]),mode=process.argv[3],records=[];
if(!['control','measured'].includes(mode))throw Error('Expected control or measured');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function edit(file,transform){const p=path.join(root,file),before=fs.readFileSync(p,'utf8'),after=transform(before);records.push({file,before:hash(before),after:hash(after)});fs.writeFileSync(p,after);}
const helper=`type RecordPoint={label:string;time:number;kind:'begin'|'end'|'point';id:number;data?:unknown};
const state=()=>typeof window==='undefined'?null:(window as unknown as {__morroviaLatency?:{events:RecordPoint[];sequence:number}}).__morroviaLatency;
export function diagnosticPoint(label:string,data?:unknown){const s=state();if(s&&s.events.length<50000){s.events.push({label,time:performance.now(),kind:'point',id:++s.sequence,data});performance.mark('morrovia:'+label);}}
export function diagnosticSpan(label:string,data?:unknown){const s=state();if(!s)return()=>{};const id=++s.sequence;s.events.push({label,time:performance.now(),kind:'begin',id,data});performance.mark('morrovia:'+label+':begin:'+id);return()=>{if(s.events.length<50000)s.events.push({label,time:performance.now(),kind:'end',id});performance.mark('morrovia:'+label+':end:'+id);};}
`;
function wrapBodies(file,select){edit(file,source=>{const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS),inserts=[];function visit(n){const label=select(n,ast);if(label){if(!n.body||!ts.isBlock(n.body))throw Error('Expected block');const a=n.body.getStart(ast)+1,b=n.body.end-1;inserts.push({at:a,text:`\nconst __morroviaEnd=diagnosticSpan(${JSON.stringify(label)});try{\n`},{at:b,text:'\n}finally{__morroviaEnd();}\n'});}ts.forEachChild(n,visit);}visit(ast);if(!inserts.length)throw Error('No probes selected '+file);let after=source;for(const ins of inserts.sort((a,b)=>b.at-a.at))after=after.slice(0,ins.at)+ins.text+after.slice(ins.at);const imports=file.startsWith('app/')?'@/lib/easyt/diagnostic-latency':'./diagnostic-latency.ts';const header=`import {diagnosticSpan,diagnosticPoint} from '${imports}';\n`;after=after.startsWith('"use client";')?after.replace('"use client";','"use client";\n'+header):header+after;
// Mechanical reversal proves wrapped bodies retain all original statements.
let reversed=after.replace(header,'').replace(/\nconst __morroviaEnd=diagnosticSpan\("[^"\n]+"\);try\{\n/g,'').replace(/\n\}finally\{__morroviaEnd\(\);\}\n/g,'');if(source.startsWith('"use client";'))reversed=reversed.replace('"use client";\n','"use client";');if(reversed!==source)throw Error('Probe reversal differs '+file);return after;});}
if(mode==='measured'){
 fs.writeFileSync(path.join(root,'lib/easyt/diagnostic-latency.ts'),helper);records.push({file:'lib/easyt/diagnostic-latency.ts',before:null,after:hash(helper)});
 wrapBodies('lib/easyt/discovery-commit.ts',n=>ts.isFunctionDeclaration(n)&&n.name?.text==='commitDiscoveryReview'?'discovery.commit-review':null);
 wrapBodies('lib/easyt/trip-builder-async-edit-session.ts',(n,a)=>{
  if(ts.isFunctionDeclaration(n))return ({storeCanonical:'canonical.prepare-and-enqueue',awaitDeviceWrites:'device.queue-drain',performAcceptedEdits:'authored.accept',resumeNecessaryWork:'optional.reconcile'})[n.name?.text]||null;
  if(ts.isArrowFunction(n)&&n.body.getText(a).includes("if (!guard.isCurrent() || draftProtected)"))return 'device.operation';return null;
 });
 edit('lib/easyt/trip-builder-async-edit-session.ts',s=>{const needle='    return runDevice(true, async () => {';if(s.split(needle).length!==2)throw Error('canonical boundary mismatch');return s.replace(needle,"    diagnosticPoint('canonical.prepared');\n"+needle).replace('    devicePending++; if (canonical) canonicalPending++;',"    diagnosticPoint('device.enqueued',{canonical,pending:devicePending});\n    devicePending++; if (canonical) canonicalPending++;").replace('      try { result = await options.saveRecovery(frozen, metadata); }',"      const __saveEnd=diagnosticSpan('recovery.save',{projectionOnly:Boolean(continuation?.projectionOnly)});\n      try { result = await options.saveRecovery(frozen, metadata); } finally {__saveEnd();}");});
 // finally before catch is invalid JS; instead nest the measured call inside the existing try.
 edit('lib/easyt/trip-builder-async-edit-session.ts',s=>s.replace("      try { result = await options.saveRecovery(frozen, metadata); } finally {__saveEnd();}\n      catch {","      try { try { result = await options.saveRecovery(frozen, metadata); } finally {__saveEnd();} }\n      catch {"));
 wrapBodies('app/journey/new/trip-builder.tsx',(n,a)=>{
  if(!ts.isArrowFunction(n))return null;const body=n.body.getText(a);
  if(ts.isVariableDeclaration(n.parent)&&['dispatchAcceptedBuilderEdits','persistDeviceRecovery'].includes(n.parent.name.getText(a)))return n.parent.name.getText(a);
  if(ts.isJsxExpression(n.parent)&&ts.isJsxAttribute(n.parent.parent)&&n.parent.parent.name.getText(a)==='onConfirm'&&body.includes('const review = canonicalDiscoveryReview;'))return 'discovery.confirm-handler';
  if(ts.isVariableDeclaration(n.parent)&&n.parent.name.getText(a)==='checkpoint'&&body.includes('owners.persistDeviceRecovery'))return 'discovery.checkpoint';
  if(ts.isPropertyAssignment(n.parent)&&['addBase','applyRouteOrder','completeMention'].includes(n.parent.name.getText(a))&&body.includes('confirmIsCurrent'))return 'discovery.port.'+n.parent.name.getText(a);
  return null;
 });
}
// Test additions collect data after assertions / errors. Journey body is unchanged.
edit('tests/core-journey-app-browser.test.ts',source=>{
 let s=source;const marker='  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });';if(s.split(marker).length!==2)throw Error('trace hook mismatch');
 const init=mode==='measured'?`  await context.addInitScript(() => {
    const w=window as any;w.__morroviaLatency={events:[],sequence:0};w.__diagnosticStorage=[];
    for(const method of ['getItem','setItem','removeItem'] as const){const original=Storage.prototype[method];(Storage.prototype as any)[method]=function(...args:any[]){const start=performance.now();try{return Reflect.apply(original,this,args);}finally{if(String(args[0]).startsWith('easyt'))w.__diagnosticStorage.push({method,start,end:performance.now(),domain:String(args[0]).split(':').slice(0,3).join(':')});}};}
    const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args:any[]){const start=performance.now();const tx=Reflect.apply(original,this,args);for(const event of ['complete','abort','error'])tx.addEventListener(event,()=>w.__diagnosticStorage.push({method:'idb.'+event,start,end:performance.now()}),{once:true});return tx;};
  });
  const __cdp=await context.newCDPSession(page);
  await __cdp.send('Profiler.enable');await __cdp.send('Profiler.start');
  await __cdp.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline.frame',transferMode:'ReturnAsStream'});
`:'';
 s=s.replace(marker,init+marker);
 const finish=`    mkdirSync(artifacts,{recursive:true});
    const __diagnostic=await page.evaluate(()=>({timeOrigin:performance.timeOrigin,time:performance.now(),timing:(window as any).__coreInteractionTiming,tasks:(window as any).__routeTasks,events:(window as any).__morroviaLatency?.events,storage:(window as any).__diagnosticStorage})).catch(()=>null);
    writeFileSync(artifacts+'/'+name+'-diagnostic.json',JSON.stringify(__diagnostic));
`+(mode==='measured'?`    const __profile=await __cdp.send('Profiler.stop');writeFileSync(artifacts+'/'+name+'-cpu-profile.json',JSON.stringify(__profile));
    const __complete=new Promise<any>(resolve=>__cdp.once('Tracing.tracingComplete',resolve));await __cdp.send('Tracing.end');const __stream=(await __complete).stream;let __trace='';while(true){const chunk=await __cdp.send('IO.read',{handle:__stream});__trace+=chunk.data;if(chunk.eof)break;}await __cdp.send('IO.close',{handle:__stream});writeFileSync(artifacts+'/'+name+'-timeline.json',__trace);
`:'');
 const finallyMarker='  } finally {\n    await context.close();';if(s.split(finallyMarker).length!==2)throw Error('finally hook mismatch');s=s.replace(finallyMarker,'  } finally {\n'+finish+'    await context.close();');
 // The body of the selected test, including all waits and assertions, is byte-identical.
 const start=source.indexOf('for (const [width,type] of [[1440'),end=source.indexOf("for (const [area,names]",start+1000);const journey=source.slice(start,end<0?undefined:end);if(!s.includes(journey))throw Error('Journey changed');return s;
});
fs.writeFileSync(path.join(root,'diagnostic-source-manifest.json'),JSON.stringify({mode,records},null,2));
console.log(JSON.stringify({mode,files:records.length,sourceManifest:'diagnostic-source-manifest.json'}));
