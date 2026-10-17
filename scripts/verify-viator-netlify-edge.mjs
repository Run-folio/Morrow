import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Offline intermediate-artifact verification only. Use an already installed
// @netlify/edge-bundler; never install packages, invoke the authenticated CLI,
// read project/account state, bundle Deno code, or deploy from this script.
const [bundlerRoot, outputDirectory] = process.argv.slice(2);
if (!bundlerRoot || !outputDirectory) throw new Error('Usage: node --experimental-strip-types scripts/verify-viator-netlify-edge.mjs <installed-edge-bundler-root> <output-directory>');
const packageRoot=resolve(bundlerRoot);
const packageMetadata=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));
assert.equal(packageMetadata.name,'@netlify/edge-bundler');
const {find,mergeDeclarations,generateManifest,validateManifest}=await import(pathToFileURL(join(packageRoot,'dist/node/index.js')).href);
const functions=await find([resolve('netlify/edge-functions')]);
const guard=functions.find(func=>func.name==='viator-inventory-guard');
assert.ok(guard,'Netlify native discovery must find the inventory guard');
// Node strips types and imports the same config export. The full native config
// extractor uses Deno; this check does not claim that absent extraction/bundle.
const {config}=await import(pathToFileURL(guard.path).href);
const userFunctionConfig={[guard.name]:config};
const declarations=mergeDeclarations([],userFunctionConfig,{},[]);
const {manifest,unroutedFunctions,declarationsWithoutFunction}=generateManifest({functions:[guard],declarations,userFunctionConfig});
validateManifest(manifest);
assert.deepEqual(unroutedFunctions,[]);assert.deepEqual(declarationsWithoutFunction,[]);
const output=resolve(outputDirectory);await mkdir(output,{recursive:true});
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(join(output,'verification.json'),JSON.stringify({
  verification:'native manifest generation and validation from discovered source plus Node-imported config',
  package:packageMetadata.name,version:packageMetadata.version,source:guard.path,
  nativeDiscovery:true,nativeManifestGenerator:true,nativeSchemaValidation:true,
  nativeDenoConfigExtraction:false,fullEdgeBundle:false,nextAdapterIntegration:false,
  hostedPostProcessing:false,hostedClientKeyOrEnforcement:false,activation:false,
},null,2)+'\n');
console.log(JSON.stringify({output,nativeManifestValidated:true,fullEdgeBundle:false,hostedEnforcement:false}));
