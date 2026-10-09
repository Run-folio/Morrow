import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
test('repeated integrity failures release the read-only settlement descriptor',()=>{
 const root=mkdtempSync(join(tmpdir(),'morrovia-reference-integrity-'));
 try{
  cpSync('data/place-reference',join(root,'data/place-reference'),{recursive:true});
  writeFileSync(join(root,'data/place-reference/settlement-prefixes.bin'),'invalid');
  const module=resolve('lib/easyt/place-reference.server.ts');
  const output=execFileSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',`
   import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
   let opened=0,closed=0;const descriptors=new Set(),open=fs.openSync,close=fs.closeSync;
   fs.openSync=(...args)=>{const fd=open(...args);if(String(args[0]).endsWith('settlements.json')){opened++;descriptors.add(fd);}return fd;};
   fs.closeSync=fd=>{if(descriptors.delete(fd))closed++;return close(fd);};syncBuiltinESMExports();
   const {searchReferencePlaces}=await import(${JSON.stringify(module)});process.chdir(${JSON.stringify(root)});
   let failures=0;for(let i=0;i<2;i++)try{searchReferencePlaces('Suva',{});}catch{failures++;}
   console.log(JSON.stringify({opened,closed,failures}));
  `],{encoding:'utf8'});
  assert.deepEqual(JSON.parse(output.trim()),{opened:2,closed:2,failures:2});
 }finally{rmSync(root,{recursive:true,force:true});}
});
