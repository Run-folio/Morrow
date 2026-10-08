import { access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const fixtures=pathToFileURL(path.join(root,'tests/helpers/batch14-server-fixtures.ts')).href;
const empty='data:text/javascript,export {};';
export async function resolve(specifier,context,nextResolve){
 if(specifier==='server-only') return {url:empty,shortCircuit:true};
 const local=specifier.startsWith('@/')?path.join(root,specifier.slice(2)):specifier.startsWith('.')&&context.parentURL?.startsWith('file:')?fileURLToPath(new URL(specifier,context.parentURL)):null;
 if(local){
  if(local.replace(/\.ts$/,'')===path.join(root,'lib/easyt/owner'))return {url:fixtures,shortCircuit:true};
  if(local.replace(/\.ts$/,'')===path.join(root,'lib/easyt/database'))return {url:process.env.BATCH14_DATABASE_MODE==='disposable'?pathToFileURL(path.join(root,'tests/helpers/batch14-repository-db.ts')).href:fixtures,shortCircuit:true};
  if(process.env.BATCH14_API_MOCK==='1'&&local.replace(/\.ts$/,'')===path.join(root,'lib/easyt/repository'))return {url:fixtures,shortCircuit:true};
  if(local.replace(/\.ts$/,'')===path.join(root,'lib/easyt/multimodal-transfer-resolution.server'))return {url:process.env.BATCH14_RESOLVER_MODE==='actual'?pathToFileURL(path.join(root,'lib/easyt/multimodal-transfer-resolution.ts')).href:'data:text/javascript,export async function resolveTripTransferJourneys(trip){return trip;}',shortCircuit:true};
  for(const candidate of [local,local+'.ts',local+'.tsx',path.join(local,'index.ts')]){
   try{await access(candidate);return {url:pathToFileURL(candidate).href,shortCircuit:true};}catch{}
  }
 }
 if(specifier==='next/server')return nextResolve('next/server.js',context);
 return nextResolve(specifier,context);
}
