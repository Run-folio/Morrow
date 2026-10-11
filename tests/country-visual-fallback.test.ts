import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
const require=createRequire(import.meta.url);
async function component(){
 const built=await build({entryPoints:['components/easyt/country-visual-fallback.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],loader:{'.css':'empty','.module.css':'empty'}});
 const module={exports:{} as Record<string,Function>};new Function('require','module','exports',built.outputFiles[0]!.text)(require,module,module.exports);return module.exports;
}
test('country illustration label is visible text, and flags or empty states stay intentional',async()=>{
 const components=await component();assert.equal(typeof components.CountryIllustrationLabel,'function','country photographs need a shared visible illustration label');
 const label=renderToStaticMarkup(createElement(components.CountryIllustrationLabel as any,{country:'Philippines'}));
 assert.match(label,/Illustrative · Philippines/);
 const flag=renderToStaticMarkup(createElement(components.default as any,{country:'Philippines'}));assert.match(flag,/Philippines flag/);
 const empty=renderToStaticMarkup(createElement(components.default as any,{country:'Not a country'}));assert.doesNotMatch(empty,/flag|Not a country/);
});
