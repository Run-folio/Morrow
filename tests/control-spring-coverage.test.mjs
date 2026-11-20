import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { createElement: h } = require('react');
const { renderToStaticMarkup: render } = require('react-dom/server');
const compiled = await build({stdin: {contents: 'export * from "./components/easyt/easyt-controls"; export * from "./components/easyt/app-motion";', resolveDir: process.cwd()}, bundle:true, outfile:'proof.js', write:false, packages:'external', platform:'node',format:'cjs',jsx:'automatic', loader:{'.css':'empty'}});
const mod={exports:{}};
vm.runInNewContext(compiled.outputFiles[0].text,{module:mod,exports:mod.exports,require});
const {MotionButton,EasyTButton,EasyTLinkButton}=mod.exports;
test('rendered fields, quiet links and text disclosures have no spring target; CTAs retain it',()=>{
 for(const [Component,props,label,spring] of [
  [MotionButton,{'aria-haspopup':'dialog'},'Add dates',false],
  [MotionButton,{'aria-haspopup':'listbox'},'Travellers',false],
  [EasyTButton,{variant:'quiet','aria-expanded':false},'Journey details and estimates',false],
  [EasyTButton,{variant:'secondary',role:'radio','aria-checked':true},'Train',false],
  [EasyTLinkButton,{variant:'quiet',href:'#details'},'View details',false],
  [EasyTButton,{type:'submit'},'Search',true],
  [EasyTButton,{variant:'secondary'},'Cancel',true],
  [MotionButton,{motion:true},'Build trip',true],
 ]) {
  const html=render(h(Component,props,label));
  assert.equal(html.includes('data-motion-button'),spring,label);
  assert.equal(html.includes('data-motion-label'),spring,label);
  if ('aria-expanded' in props) assert.match(html,/aria-expanded="false"/);
 }
});
