import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='data/place-reference/',manifest=JSON.parse(readFileSync(root+'manifest.json','utf8'));
const source=readFileSync(root+'airports.json'),entry=manifest.files.find((f:{path:string})=>f.path==='airports.json');
if(!entry||entry.bytes!==source.length||entry.sha256!==createHash('sha256').update(source).digest('hex'))throw new Error('Pinned airport source integrity failed');
const rows=JSON.parse(source.toString()) as Array<[string,string,string,number,number,string,string,string,boolean,string]>;
const output=JSON.stringify({snapshotId:manifest.snapshotId,airports:rows.filter(r=>r[8]===true&&r[5]!=='closed_airport'&&!!r[6]).map(r=>r.slice(0,5))})+'\n';
const path=root+'scheduled-airport-identities.json';
if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==output)throw new Error('Scheduled airport identities are stale');}
else writeFileSync(path,output);
