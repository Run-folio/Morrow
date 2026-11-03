import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {transformSync} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url), module={exports:{}};
const code=transformSync(readFileSync(new URL('../components/easyt/itinerary-draggable-card.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code;
new Function('require','module','exports',code)(require,module,module.exports);
const Card=module.exports.default;
test('saved idea list item has a compatible generic root and preserves drag/content attributes',()=>{
 const html=renderToStaticMarkup(React.createElement(Card,{role:'listitem',draggable:true,onDragStart:()=>{},'aria-label':'Saved idea',children:'Synthetic saved idea'}));
 assert.match(html,/^<div\b/);assert.match(html,/role="listitem"/);assert.match(html,/data-itinerary-draggable="true"/);assert.match(html,/Synthetic saved idea/);
});
test('other itinerary cards retain native article semantics',()=>{
 const html=renderToStaticMarkup(React.createElement(Card,{'aria-label':'Activity',children:'Synthetic activity'}));
 assert.match(html,/^<article\b/);assert.match(html,/aria-label="Activity"/);
});
