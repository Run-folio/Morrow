import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const enabled=process.env.MORROVIA_AUTH_APP_BROWSER_TESTS==='1';
const require=createRequire(import.meta.url);
const props={callbackURL:'/journey/trips',googleEnabled:false,configured:true,emailVerificationRequired:false,showSetupNotice:false};
async function bundle(hydrate:boolean){
 const root=fileURLToPath(new URL('../',import.meta.url));
 const result=await build({stdin:{contents:hydrate?`import React from 'react';import {hydrateRoot} from 'react-dom/client';import Login from './app/journey/login/login-form';hydrateRoot(document.getElementById('root'),React.createElement(Login,${JSON.stringify(props)}));`:`import React from 'react';import {renderToString} from 'react-dom/server';import Login from './app/journey/login/login-form';globalThis.loginTestHtml=renderToString(React.createElement(Login,${JSON.stringify(props)}));`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:hydrate?'browser':'node',format:hydrate?'iife':'cjs',jsx:'automatic',loader:{'.css':'empty','.module.css':'empty'},define:{'process.env.NODE_ENV':'"test"','process.env':'{}'},plugins:[{name:'local-auth-boundary',setup(b){
 b.onResolve({filter:/^@\/lib\/auth-client$/},()=>({path:'auth',namespace:'fixture'}));
 b.onLoad({filter:/auth/,namespace:'fixture'},()=>({contents:`export const authClient={signIn:{email:async credentials=>{await fetch('/synthetic-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)});return {error:{code:'INVALID_EMAIL_OR_PASSWORD',message:'Synthetic rejection'}}}}};`}));
 b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
 b.onLoad({filter:/link/,namespace:'fixture'},()=>({resolveDir:root,contents:`import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}`}));
 }}]});return result.outputFiles[0]!.text;
}
async function fixture(javaScriptEnabled:boolean,delay=0){
 const ssr=await bundle(false);new Function('require',ssr)(require);const html=(globalThis as unknown as {loginTestHtml:string}).loginTestHtml;
 const js=await bundle(true);const requests:{method:string;url:string;credentialBody:boolean}[]=[];
 const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const body=Buffer.concat(chunks).toString();requests.push({method:req.method!,url:req.url!,credentialBody:body.includes('synthetic-password-123')});
 if(req.url==='/hydrate.js'){if(delay)await new Promise(r=>setTimeout(r,delay));res.setHeader('Content-Type','text/javascript');res.end(js);return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<div id="root">${html}</div><script src="/hydrate.js"></script>`);
 });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as {port:number};
 const {chromium}=require(`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);const browser=await chromium.launch({headless:true});const page=await browser.newPage({javaScriptEnabled});page.on('pageerror',error=>console.log('Synthetic fixture page error:',error.message));
 page.setDefaultTimeout(2500);await page.goto(`http://127.0.0.1:${address.port}/journey/login`,{waitUntil:'commit'});return {page,requests,close:async()=>{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}};
}
for(const js of [false,true])test(`login cannot put credentials in native GET with ${js?'delayed':'disabled'} JavaScript`,{skip:!enabled,timeout:20000},async()=>{
 const f=await fixture(js,js?1800:0);try{
 const submit=f.page.getByRole('button',{name:'Sign in →',exact:true});await submit.waitFor();assert.equal(await submit.isDisabled(),true,'SSR submit waits for its handler');
 await f.page.locator('input[name=email]').fill('synthetic@example.invalid');await f.page.locator('input[name=password]').fill('synthetic-password-123');
 await f.page.locator('input[name=password]').press('Enter');await f.page.waitForTimeout(100);
 assert.equal(f.requests.filter(r=>r.method==='GET'&&/password|synthetic%40/.test(r.url)).length,0);
 // Forced native submit also has a safe method even if the guard is bypassed.
 await f.page.evaluate(()=>HTMLFormElement.prototype.submit.call(document.querySelector('form')));await f.page.waitForTimeout(150);
 assert.ok(f.requests.some(r=>r.method==='POST'&&r.url==='/journey/login'&&r.credentialBody));
 assert.ok(f.requests.every(r=>!r.url.includes('password')&&!r.url.includes('synthetic%40')));
 }finally{await f.close()}
});
test('hydrated sign-in keeps the existing client POST and recovery semantics',{skip:!enabled,timeout:20000},async()=>{
 const f=await fixture(true);try{
 const submit=f.page.getByRole('button',{name:'Sign in →',exact:true});await submit.waitFor();await f.page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled);
 await f.page.locator('input[name=email]').fill('synthetic@example.invalid');await f.page.locator('input[name=password]').fill('synthetic-password-123');await submit.click();await f.page.getByRole('alert').waitFor();
 assert.equal(f.requests.filter(r=>r.url==='/synthetic-auth'&&r.method==='POST'&&r.credentialBody).length,1);assert.equal(f.requests.filter(r=>r.url==='/journey/login'&&r.method==='POST').length,0);
 }finally{await f.close()}
});
