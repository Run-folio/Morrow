import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {resolvePlaceMentions} from '../lib/easyt/place-intelligence.ts';
import {createDiscoveryDraft} from '../lib/easyt/discovery-draft.ts';
import {projectDiscovery} from '../lib/easyt/discovery-projection.ts';
import {discoveryBaseAreaForMention} from '../lib/easyt/discovery-confirmation.ts';
const require=createRequire(import.meta.url);
const bundle=(await build({entryPoints:['components/easyt/discovery-modal.tsx'],bundle:true,write:false,outfile:'offline-modal.cjs',format:'cjs',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty','.module.css':'empty'},define:{'process.env.NODE_ENV':'"test"'}})).outputFiles[0]!.text;
const module={exports:{} as any};new vm.Script(bundle).runInNewContext({module,exports:module.exports,require,console,process:{env:{NODE_ENV:'test'}}});
function render(status:string,language='en'){
 const mention=resolvePlaceMentions('Bali').mentions[0]!,draft=createDiscoveryDraft(),area=discoveryBaseAreaForMention(mention,draft);
 return renderToStaticMarkup(React.createElement(module.exports.DiscoveryModal,{open:true,language,entry:{kind:'region',step:'places'},mention,
  projection:projectDiscovery({mention,draft,context:{interests:[],existingPlaceIds:[]}}),draft,onAction(){},onConfirm(){},onClose(){},
  baseChoice:{area,candidates:[],status,value:'',onChange(){},onSelect(){},onCancel(){},onRetry(){}}}));
}
test('root base chooser never silently renders ready with no choices',()=>{
 const html=render('ready');assert.match(html,/No verified bases found/);assert.match(html,/Search for a city or town in Bali/);
});
test('base discovery distinguishes empty and unavailable with an explicit retry control',()=>{
 const empty=render('empty'),unavailable=render('unavailable');
 assert.match(empty,/No verified bases found/);assert.match(unavailable,/Base suggestions are unavailable/);
 assert.match(unavailable,/>Try again</);assert.match(empty,/>Try again</);
 assert.doesNotMatch(unavailable,/No verified bases found/);
});
test('base discovery recovery is localized in Spanish',()=>{
 const html=render('unavailable','es');assert.match(html,/Volver a intentar/);assert.match(html,/No se pueden cargar/);
});
