import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compilePinnedPhysicalLandSource,type PhysicalLandApproval} from '../lib/easyt/physical-land-source.ts';
const root=new URL('../public/data/physical-land/',import.meta.url);
const raw=readFileSync(new URL('unguja-osm-full.json',root),'utf8');
const approval=JSON.parse(readFileSync(new URL('source-approval.json',root),'utf8')) as PhysicalLandApproval;
const artifact=compilePinnedPhysicalLandSource(raw,approval),text=JSON.stringify(artifact)+'\n';
const coarse=readFileSync(new URL('../data/land-connection-10m.json',import.meta.url));
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const manifest=JSON.stringify({version:1,rawSHA256:approval.rawSHA256,outputSHA256:hash(text),outputBytes:Buffer.byteLength(text),capturedAt:approval.capturedAt,componentKeys:artifact.components.map(c=>c.key),licence:'ODbL-1.0',classification:'Derivative Database',attribution:'© OpenStreetMap contributors',dataSharing:'/data/physical-land/NOTICE.txt',simplification:'none',coarseBase:{file:'natural-earth-base.json',sha256:hash(coarse),source:'Natural Earth via world-atlas2.0.2',licence:'public domain'}},null,2)+'\n';
if(process.argv.includes('--check')){
 if(readFileSync(new URL('components.json',root),'utf8')!==text||readFileSync(new URL('manifest.json',root),'utf8')!==manifest||!readFileSync(new URL('natural-earth-base.json',root)).equals(coarse))throw new Error('Physical-land public derivative/source integrity mismatch');
 const notice=readFileSync(new URL('NOTICE.txt',root),'utf8');
 if(!['Derivative Database','ODbL','OpenStreetMap contributors','components.json','unguja-osm-full.json','natural-earth-base.json'].every(part=>notice.includes(part)))throw new Error('Physical-land licence/data-sharing notice incomplete');
}else{
 writeFileSync(new URL('components.json',root),text);writeFileSync(new URL('manifest.json',root),manifest);writeFileSync(new URL('natural-earth-base.json',root),coarse);
}
console.log({components:artifact.components.length,bytes:Buffer.byteLength(text),checked:process.argv.includes('--check')});
