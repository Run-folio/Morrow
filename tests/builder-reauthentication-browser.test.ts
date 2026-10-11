import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const enabled=process.env.MORROVIA_AUTH_APP_BROWSER_TESTS==='1';
const require=createRequire(import.meta.url);
import {tripSyncSignInPath} from '../lib/easyt/trip-continuity.ts';
const authHref=tripSyncSignInPath('audit-local-trip', 'builder');
const returnHref=new URL(authHref,'http://fixture.invalid').searchParams.get('next')!;
const props={callbackURL:returnHref,googleEnabled:false,configured:true,emailVerificationRequired:false,showSetupNotice:false};
async function bundle(hydrate:boolean,initialMode:"sign-in"|"sign-up"="sign-in"){
 const renderProps={...props,initialMode};
 const root=fileURLToPath(new URL('../',import.meta.url));
 const result=await build({stdin:{contents:hydrate?`import React from 'react';import {hydrateRoot} from 'react-dom/client';import Login from './app/journey/login/login-form';hydrateRoot(document.getElementById('root'),React.createElement(Login,${JSON.stringify(renderProps)}));`:`import React from 'react';import {renderToString} from 'react-dom/server';import Login from './app/journey/login/login-form';globalThis.loginTestHtml=renderToString(React.createElement(Login,${JSON.stringify(renderProps)}));`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:hydrate?'browser':'node',format:hydrate?'iife':'cjs',jsx:'automatic',loader:{'.css':'empty','.module.css':'empty'},define:{'process.env.NODE_ENV':'"test"','process.env':'{}'},plugins:[{name:'local-auth-boundary',setup(b){
 b.onResolve({filter:/^@\/lib\/auth-client$/},()=>({path:'auth',namespace:'fixture'}));
 b.onLoad({filter:/auth/,namespace:'fixture'},()=>({contents:`export const authClient={signIn:{email:async credentials=>{await fetch('/synthetic-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)});return window.__AUDIT_AUTH_SUCCESS__?{error:null}:{error:{code:'INVALID_EMAIL_OR_PASSWORD',message:'Synthetic rejection'}}}}};`}));
 b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
 b.onLoad({filter:/link/,namespace:'fixture'},()=>({resolveDir:root,contents:`import React from 'react';export default function Link({children,...props}){return React.createElement('a',props,children)}`}));
 }}]});return result.outputFiles[0]!.text;
}
async function fixture(javaScriptEnabled:boolean,delay=0,mode:"sign-in"|"sign-up"="sign-in"){
 const ssr=await bundle(false,mode);new Function('require',ssr)(require);const html=(globalThis as unknown as {loginTestHtml:string}).loginTestHtml;
 const js=await bundle(true,mode);const requests:{method:string;url:string;credentialBody:boolean}[]=[];
 const server=createServer(async(req,res)=>{const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const body=Buffer.concat(chunks).toString();requests.push({method:req.method!,url:req.url!,credentialBody:body.includes('synthetic-password-123')});
 if(req.url==='/hydrate.js'){if(delay)await new Promise(r=>setTimeout(r,delay));res.setHeader('Content-Type','text/javascript');res.end(js);return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<div id="root">${html}</div><script src="/hydrate.js"></script>`);
 });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as {port:number};
 const {chromium}=require(`${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`);const browser=await chromium.launch({headless:true});const page=await browser.newPage({javaScriptEnabled});page.on('pageerror',(error:Error)=>console.log('Synthetic fixture page error:',error.message));
 page.setDefaultTimeout(2500);await page.goto(`http://127.0.0.1:${address.port}/journey/login`,{waitUntil:'commit'});return {page,requests,close:async()=>{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}};
}
test('mounted login readiness changes busy and disabled truthfully', {skip:!enabled,timeout:20000}, async () => {
 const f = await fixture(true,1800);
 try {
  const form = f.page.locator('form');
  assert.equal(await form.getAttribute('aria-busy'),'true');
  assert.equal(await f.page.locator('button[type=submit]').isDisabled(),true);
  await f.page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled);
  assert.equal(await form.getAttribute('aria-busy'),null);
  assert.equal(await f.page.locator('input[name=email]').isDisabled(),false);
 } finally { await f.close(); }
});

test('Builder reauthentication success cancel Back Forward retains return and device fixture', {skip:!enabled,timeout:20000}, async () => {
 const f = await fixture(true);
 try {
  const origin = new URL(f.page.url()).origin;
  await f.page.evaluate(() => localStorage.setItem('audit-disposable-trip','retained'));
  await f.page.goto(origin+'/journey/new?trip=audit-local-trip&recover=1');
  await f.page.goto(origin+authHref);
  assert.equal(new URL(f.page.url()).searchParams.get('next'),returnHref);
  await f.page.goBack();
  assert.equal(new URL(f.page.url()).pathname,'/journey/new');
  await f.page.goForward();
  assert.equal(new URL(f.page.url()).pathname,'/journey/login');
  await f.page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled);
  await f.page.evaluate(() => {
   (window as Window & {__AUDIT_AUTH_SUCCESS__?: boolean}).__AUDIT_AUTH_SUCCESS__=true;
  });
  await f.page.locator('input[name=email]').fill('synthetic@example.invalid');
  await f.page.locator('input[name=password]').fill('synthetic-password-123');
  await f.page.getByRole('button',{name:'Sign in →',exact:true}).click();
  await f.page.waitForURL('**/journey/new?**');
  assert.equal(new URL(f.page.url()).search,'?trip=audit-local-trip&recover=1');
  assert.equal(await f.page.evaluate(() => localStorage.getItem('audit-disposable-trip')),'retained');
 } finally { await f.close(); }
});
