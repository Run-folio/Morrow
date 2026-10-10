import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {canonicalPlaceSuggestionsForQuery,appendSelectedPlanningAreaMention,PLACE_INTELLIGENCE_VERSION,PLACE_INTELLIGENCE_PARSER_VERSION} from '../lib/easyt/place-intelligence.ts';
import {mergeEquivalentPlaceSuggestions,prioritizeRouteStopSuggestions} from '../lib/easyt/place-autocomplete.ts';
import {structuredTripBriefFromSavedSelections} from '../lib/easyt/structured-trip-brief.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {prepareBuilderHandlerEdits} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
function pickerFlags(){
 const ast=ts.createSourceFile('trip-builder.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found:ts.JsxSelfClosingElement|undefined;
 function visit(node:ts.Node){if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(ast)==='CanonicalPlaceAutocomplete'&&node.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(ast)==='id'&&p.initializer?.getText(ast)==='{stopInputId}'))found=node;ts.forEachChild(node,visit);}visit(ast);assert(found,'Mounted Add destination picker');
 const flag=(name:string)=>found!.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(ast)===name&&(!p.initializer||p.initializer.getText(ast)==='{true}'));
 return {includeNonRoutable:flag('includeNonRoutable'),requireCoordinates:flag('requireCoordinates')};
}
test('Builder Add destination offers an existing country planning intent without overnight coordinates',()=>{
 const flags=pickerFlags();const choices=prioritizeRouteStopSuggestions(mergeEquivalentPlaceSuggestions(canonicalPlaceSuggestionsForQuery('France',undefined,8,flags.includeNonRoutable).filter(s=>!flags.requireCoordinates||Boolean(s.coordinates))),'route-stop','France');
 const country=choices.find(s=>s.canonicalPlaceId==='france'&&s.placeType==='country');assert(country,'The actual Builder picker must expose the existing France country intent, not just Franceville namesakes');assert.equal(country.coordinates,undefined);
});
test('existing planning-area acceptance saves the selected country source while retaining every overnight occurrence and order',()=>{
 let trip=requireReadableTripDocument(canonicalRouteFixture());trip.brief.structuredBrief=structuredTripBriefFromSavedSelections({destinations:trip.stops.map(stop=>({id:stop.id,name:stop.name,canonicalPlaceId:stop.canonicalPlaceId,role:'preferred',priority:'normal'})),travellers:trip.travellers,dates:{start:trip.startDate,end:trip.endDate},pace:trip.brief.intent.preferences.pace,interests:[],transportPreferences:[],budget:trip.brief.budgetBand,avoidDriving:false});const before=structuredClone(trip);const suggestion=canonicalPlaceSuggestionsForQuery('France',undefined,8,true).find(s=>s.canonicalPlaceId==='france')!;assert(suggestion);
 const start=source.indexOf('    const currentResult: PlaceIntelligenceResult =',source.indexOf('  const beginPlanningAreaClarification ='));
 const end=source.indexOf('    setCapturedStructuredBrief',start);const code=ts.transpileModule(`return (()=>{${source.slice(start,end)};return appended;})();`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const scope={suggestion,role:'preferred',capturedStructuredBrief:trip.brief.structuredBrief,intakeMentions:[],PLACE_INTELLIGENCE_VERSION,PLACE_INTELLIGENCE_PARSER_VERSION,appendSelectedPlanningAreaMention,stopInput:'France',builderEditSessionRef:{current:{getSnapshot:()=>({trip})}},dispatchAcceptedBuilderEdits:(edits:any[])=>{const r=prepareBuilderHandlerEdits(trip,edits,builderDocumentFingerprint(trip));assert(r.ok,JSON.stringify(r));trip=r.trip;return true;}};
 const appended=new Function('scope',`with(scope){${code}}`)(scope);const intent=trip.brief.intent.route.destinations.find(i=>i.id===appended.mention.mentionId)!;
 assert.equal(intent.kind,'planning_area');assert.equal(intent.resolution,'unresolved');assert.equal(intent.requestedNights,null);assert.deepEqual(intent.stopIds,[]);assert.equal(intent.selectedPlace?.canonicalPlaceId,'france');assert.equal(intent.selectedPlace?.coordinates,undefined);
 assert.deepEqual(trip.stops,before.stops);assert.equal(trip.startDate,before.startDate);assert.equal(trip.endDate,before.endDate);assert.equal(trip.brief.intent.route.orderAuthority,before.brief.intent.route.orderAuthority);assert.deepEqual(trip.brief.intent.route.destinations.filter(i=>i.id!==intent.id),before.brief.intent.route.destinations);
});
