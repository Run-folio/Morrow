import assert from 'node:assert/strict';
import test from 'node:test';
import {assertPublicPlaceAliasRequestBytes,createPublicPlaceAliasRequest} from '../lib/easyt/public-place-alias-request.ts';

test('complete serialized UTF-8 byte boundary includes schema and Unicode, not character estimates',()=>{
 const base={input:'',schema:{description:'fixed instructions and schema'}};
 const overhead=Buffer.byteLength(JSON.stringify(base),'utf8');
 const edge={...base,input:'a'.repeat(4096-overhead)};
 assert.equal(Buffer.byteLength(JSON.stringify(edge),'utf8'),4096);assert.doesNotThrow(()=>assertPublicPlaceAliasRequestBytes(edge));
 assert.throws(()=>assertPublicPlaceAliasRequestBytes({...edge,input:edge.input+'a'}));
 const unicode={...base,input:'温'.repeat(Math.floor((4096-overhead)/3))};
 assert.ok(JSON.stringify(unicode).length<4096);assert.doesNotThrow(()=>assertPublicPlaceAliasRequestBytes(unicode));
 assert.throws(()=>assertPublicPlaceAliasRequestBytes({...unicode,input:unicode.input+'温'}));
 assert.throws(()=>assertPublicPlaceAliasRequestBytes({...edge,schema:{description:base.schema.description+' extra schema/instructions'}}));
});

test('production request is fixed, deeply immutable and complete; oversized explicit country cannot bypass byte guard',()=>{
 const request=createPublicPlaceAliasRequest('平湯温泉','Japan');assert.equal(Object.isFrozen(request),true);assert.ok(Buffer.byteLength(JSON.stringify(request),'utf8')<=4096);
 assert.throws(()=>{(request as any).text.format.schema.additionalProperties=true;});
 assert.throws(()=>createPublicPlaceAliasRequest('Hirayu',' '.repeat(5000)+'Japan'));
 const serialized=JSON.stringify(request);for(const text of ['Suggest alternate','平湯温泉','json_schema','alternate_name','max_output_tokens'])assert.ok(serialized.includes(text),text);
});
