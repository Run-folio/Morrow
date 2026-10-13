const fs=require('fs');
(async()=>{
 const target=(await (await fetch('http://127.0.0.1:9229/json/list')).json())[0];
 const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let id=0;
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 await send('Profiler.enable');const clockStart={wallMs:Date.now(),monotonicUs:Number(process.hrtime.bigint()/1000n)};await send('Profiler.start');fs.writeFileSync(process.argv[2]+'.ready','ready');
 await new Promise(resolve=>process.stdin.once('data',resolve));const result=await send('Profiler.stop');fs.writeFileSync(process.argv[2],JSON.stringify({clockStart,clockEnd:{wallMs:Date.now(),monotonicUs:Number(process.hrtime.bigint()/1000n)},...result}));ws.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
