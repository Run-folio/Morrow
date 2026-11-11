import assert from 'node:assert/strict';
import test from 'node:test';
import { captureJourneyBrief, captureJourneyBriefFromSemanticIntent } from '../lib/easyt/journey-capture.ts';
import { createHomeTripDraft, projectHomepageInput } from '../lib/easyt/home-trip-handoff.ts';
import { SEMANTIC_TRIP_INTENT_SCHEMA_VERSION, SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION, type SemanticTripIntent } from '../lib/easyt/semantic-trip-intent.ts';
import { emptyHomepageInput } from './fixtures/homepage-dual-entry.ts';

const italy='Two adults in Italy. Start in Rome on 10 May 2027. Spend 4 nights in Rome, 4 nights in Florence and 4 nights in Venice, in that order, ending in Venice on 22 May 2027. Travel between these cities by train. We like history, local food and walkable neighbourhoods, with a mid-range budget.';
const snapshot=(prompt:string)=>({...emptyHomepageInput(),mode:'describe' as const,prompt,tripType:{state:'selected' as const,value:'one_way' as const}});

test('ordinary stay instructions never become unresolved places',()=>{
 const c=captureJourneyBrief(italy);
 assert.equal(c.mentions.some(m=>/^(?:spend|in that order)$/i.test(m.sourceText)),false);
 assert.equal(c.structuredBrief.destinations.some(d=>/\bon \d/.test(d.name)),false,'date-bearing gateway clauses are not extra places');
});
test('quantity-before-place stays sum to the full duration and bind to each stay occurrence',()=>{
 const c=captureJourneyBrief(italy);
 assert.equal(c.durationDays,13);
 const stays=c.structuredBrief.hardConstraints.filter(x=>x.type==='fixed-commitment');
 assert.deepEqual(stays.map(x=>[x.place?.name,x.fixedNights]),[['Rome',4],['Florence',4],['Venice',4]]);
 assert.equal(new Set(stays.map(x=>x.sourceMentionId)).size,3);
});
test('explicit overall budget wins over quantity-before-place allocations',()=>{
 const c=captureJourneyBrief('20 nights in Italy. Spend 4 nights in Rome and 4 nights in Florence.');
 assert.equal(c.durationDays,21);
});
test('quantity-before-place repeated stays preserve separate source occurrences',()=>{
 const c=captureJourneyBrief('Spend 2 nights in Bangkok, 4 nights in Chiang Mai, then 1 night in Bangkok.');
 assert.equal(c.durationDays,8);
 assert.deepEqual(c.structuredBrief.hardConstraints.filter(x=>x.type==='fixed-commitment').map(x=>[x.place?.name,x.fixedNights]),[['Bangkok',2],['Chiang Mai',4],['Bangkok',1]]);
});
test('explicit start and ending date clauses retain valid calendar dates and provenance',()=>{
 const c=captureJourneyBrief(italy);
 assert.equal(c.structuredBrief.dates.start?.value,'2027-05-10');
 assert.equal(c.structuredBrief.dates.end?.value,'2027-05-22');
 assert.equal(c.structuredBrief.dates.start?.provenance.sourceText,'10 May 2027');
 assert.equal(c.structuredBrief.dates.fixed?.value,true);
 assert.deepEqual(c.structuredBrief.issues,[]);
});
test('a labelled trip date range is captured without guessing omitted years',()=>{
 const dated=captureJourneyBrief('Rome, Florence and Venice. Trip dates: 10–22 May 2027.');
 assert.equal(dated.structuredBrief.dates.start?.value,'2027-05-10');
 assert.equal(dated.structuredBrief.dates.end?.value,'2027-05-22');
 assert.deepEqual(captureJourneyBrief('Rome and Venice in May.').structuredBrief.dates,{});
});
test('untouched homepage date controls inherit the explicit captured range',()=>{
 const result=projectHomepageInput({snapshot:snapshot(italy),profile:null,handoffId:'italy-explicit-dates'});
 assert.equal(result.ok,true);
 if(!result.ok)return;
 assert.equal(result.draft.startDate,'2027-05-10');assert.equal(result.draft.endDate,'2027-05-22');assert.equal(result.draft.datesExplicit,true);
 assert.deepEqual(result.draft.routeIntent?.destinations.filter(x=>x.requestedNights!=null).map(x=>x.requestedNights),[4,4,4]);
 const capture=captureJourneyBrief(italy);
 const legacy=createHomeTripDraft({capture,handoffId:'legacy-date-inheritance',datesExplicit:false,startDate:'2026-11-10',endDate:'2026-11-22',travellers:2,travellersExplicit:false,interests:[]});
 assert.equal(legacy.startDate,'2027-05-10');assert.equal(legacy.endDate,'2027-05-22');
});
test('selected and cleared homepage dates take precedence over prompt dates',()=>{
 for(const dates of [{state:'selected' as const,value:{start:'2027-06-01',end:'2027-06-13'}},{state:'cleared' as const}]){
  const result=projectHomepageInput({snapshot:{...snapshot(italy),dates},profile:null,handoffId:'date-control-precedence'});assert.equal(result.ok,true);if(!result.ok)continue;
  assert.equal(result.draft.startDate,dates.state==='selected'?'2027-06-01':undefined);
  assert.equal(result.draft.endDate,dates.state==='selected'?'2027-06-13':undefined);
  assert.equal(result.draft.structuredBrief?.dates.start?.value,dates.state==='selected'?'2027-06-01':undefined);
 }
});
test('invalid, reversed and conflicting explicit dates require review instead of silent defaults',()=>{
 for(const prompt of ['Start in Rome on 31 April 2027, finish in Venice on 12 May 2027.','Start in Rome on 22 May 2027, finish in Venice on 10 May 2027.','Start in Rome on 10 May 2027. Start in Rome on 11 May 2027. Finish in Venice on 22 May 2027.']){
  const result=projectHomepageInput({snapshot:snapshot(prompt),profile:null,handoffId:'invalid-prompt-date'});
  assert.equal(result.ok,false,prompt);if(result.ok)continue;assert.ok(result.issues.some(x=>x.field==='dates'),prompt);
 }
});
test('semantic candidates cannot reintroduce ordinary Spend or in-that-order grammar',async()=>{
 const intent:SemanticTripIntent={schemaVersion:SEMANTIC_TRIP_INTENT_SCHEMA_VERSION,rawPromptVersion:SEMANTIC_TRIP_INTENT_RAW_PROMPT_VERSION,origin:{sourceText:null,certainty:null},journeyEnd:{sourceText:null,interpretedText:null,mode:'unknown',certainty:null},duration:{sourceText:null,value:null,unit:null},explicitDateTexts:[],destinationCandidates:['Spend','Rome','Florence','Venice','in that order'].map(sourceText=>({sourceText,interpretedText:null,role:'route-stop' as const,certainty:'explicit' as const})),pointsOfInterest:[],transport:{departure:{sourceText:null,mode:null},interStop:{sourceText:null,modes:[]},avoid:[]},pace:{sourceText:null,value:null},interests:[],constraints:[],ambiguities:[],unresolvedMeaningfulText:[]};
 const c=await captureJourneyBriefFromSemanticIntent(italy,intent);
 assert.equal(c.mentions.some(m=>/^(?:spend|in that order)$/i.test(m.sourceText)),false);
});
test('a start-only city without an explicit stay remains an origin, without invented dates or nights',()=>{
 const c=captureJourneyBrief('Start in Tokyo, then visit Kanazawa and Kyoto for a total of 12 nights. Two adults travelling by train. Finish in Kyoto.');
 assert.ok(c.mentions.some(m=>m.canonicalName==='Tokyo'&&['origin','fixed_start'].includes(m.role)));
 assert.equal(c.mentions.some(m=>m.canonicalName==='Tokyo'&&m.role==='preferred'),false);
 assert.deepEqual(c.structuredBrief.dates,{});assert.equal(c.durationDays,13);
});

test('date and explicit stay-budget contradictions cannot silently enter the builder',()=>{
 const prompt='Start in Rome on 10 May 2027, finish in Florence on 15 May 2027. Spend 4 nights in Rome and 4 nights in Florence.';
 const c=captureJourneyBrief(prompt);
 assert.ok(c.structuredBrief.issues.some(x=>x.code==='DURATION_DATE_MISMATCH'));
 const result=projectHomepageInput({snapshot:snapshot(prompt),profile:null,handoffId:'dates-vs-stays'});
 assert.equal(result.ok,false);if(!result.ok)assert.ok(result.issues.some(x=>x.field==='dates'));
});
test('refused and tentative boundaries do not establish fixed prompt dates',()=>{
 for(const prompt of ['Do not start in Rome on 10 May 2027.','Maybe start in Rome on 10 May 2027.','I may start in Rome on 10 May 2027.','Start in Rome perhaps on 10 May 2027.']){
  assert.deepEqual(captureJourneyBrief(prompt).structuredBrief.dates,{},prompt);
 }
 const corrected=captureJourneyBrief('Do not start in Rome on 10 May 2027. Start in Rome on 11 May 2027, finish in Venice on 22 May 2027.');
 assert.equal(corrected.structuredBrief.dates.start?.value,'2027-05-11');
 assert.equal(corrected.structuredBrief.dates.end?.value,'2027-05-22');
});
test('activity-only dates and unsupported yearless dates remain outside trip dates',()=>{
 for(const prompt of ['Rome and Venice. Start the museum visit on 10 May 2027.','Rome and Venice. My walking tour is from 10 May 2027 to 12 May 2027.','Start in Rome on 10 May and finish in Venice on 22 May.']){
  assert.deepEqual(captureJourneyBrief(prompt).structuredBrief.dates,{},prompt);
 }
});
test('explicit date controls can correct an invalid prompt without restoring it after a clear',()=>{
 const prompt='Start in Rome on 30 February 2027, finish in Venice on 12 March 2027.';
 for(const dates of [{state:'selected' as const,value:{start:'2027-05-10',end:'2027-05-22'}},{state:'cleared' as const}]){
  const result=projectHomepageInput({snapshot:{...snapshot(prompt),dates},profile:null,handoffId:'correct-invalid-dates'});
  assert.equal(result.ok,true);if(!result.ok)continue;
  assert.equal(result.draft.startDate,dates.state==='selected'?'2027-05-10':undefined);
 }
});

for(const prompt of ['Start in Rome, visit the Colosseum on 10 May 2027. Finish in Venice on 22 May 2027.','Start in Rome and see the Colosseum on 10 May 2027. Finish in Venice on 22 May 2027.'])test(`an activity clause cannot donate its date to the preceding route boundary: ${prompt}`,()=>{
 const dates=captureJourneyBrief(prompt).structuredBrief.dates;
 assert.equal(dates.start,undefined);assert.equal(dates.end?.value,'2027-05-22');
});

test('a single captured boundary date requires review rather than disappearing into defaults',()=>{
 for(const prompt of ['Start in Rome on 10 May 2027. Visit Florence and Venice.','Rome, Florence and Venice. Finish in Venice on 22 May 2027.']){
  const result=projectHomepageInput({snapshot:snapshot(prompt),profile:null,handoffId:'partial-prompt-date'});
  assert.equal(result.ok,false,prompt);if(!result.ok)assert.ok(result.issues.some(x=>x.field==='dates'));
  for(const dates of [{state:'selected' as const,value:{start:'2027-06-01',end:'2027-06-13'}},{state:'cleared' as const}]){
   const corrected=projectHomepageInput({snapshot:{...snapshot(prompt),dates},profile:null,handoffId:'resolved-partial-date'});
   assert.equal(corrected.ok,true,prompt);
  }
 }
});

test('a refused prefix stay quantity cannot become a fixed stay or whole-trip duration',()=>{
 const c=captureJourneyBrief('Do not spend 4 nights in Rome. Spend 2 nights in Florence.');
 assert.deepEqual(c.structuredBrief.hardConstraints.filter(x=>x.type==='fixed-commitment').map(x=>[x.place?.name,x.fixedNights]),[['Florence',2]]);
 assert.equal(c.durationDays,3);
});
test('alternative or tentative date suffixes require review without selecting the first date',()=>{
 for(const prompt of ['Start in Rome on 10 May 2027 or 11 May 2027. Finish in Venice on 22 May 2027.','Start in Rome on 10 May 2027, perhaps. Finish in Venice on 22 May 2027.']){
  const c=captureJourneyBrief(prompt);assert.notEqual(c.structuredBrief.dates.fixed?.value,true,prompt);
  const result=projectHomepageInput({snapshot:snapshot(prompt),profile:null,handoffId:'uncertain-dates'});
  assert.equal(result.ok,false,prompt);if(!result.ok)assert.ok(result.issues.some(x=>x.field==='dates'));
 }
});
test('an activity date label cannot establish the trip date range',()=>{
 assert.deepEqual(captureJourneyBrief('Rome, museum dates: 10–22 May 2027.').structuredBrief.dates,{});
});

test('joint or alternative prefix stay locations do not allocate the full quantity to the first city',()=>{
 for(const prompt of ['Spend 4 nights in Rome and Florence.','Spend 4 nights in Rome or Florence.']){
  const c=captureJourneyBrief(prompt);assert.equal(c.durationDays,5);
  assert.deepEqual(c.structuredBrief.hardConstraints.filter(x=>x.type==='fixed-commitment'),[]);
 }
});

test('uncertain labelled ranges require review rather than fixing the first range',()=>{
 for(const prompt of ['Trip dates: 10–22 May 2027, perhaps.','Trip dates: 10–22 May 2027, or 11–23 May 2027.','Travel dates: 2027-05-10 to 2027-05-22, maybe.']){
  const result=projectHomepageInput({snapshot:snapshot(prompt+' Rome and Venice.'),profile:null,handoffId:'uncertain-range'});
  assert.equal(result.ok,false,prompt);if(result.ok)continue;assert.ok(result.issues.some(x=>x.field==='dates'),prompt);
 }
});
test('contracted boundary refusals do not establish fixed dates',()=>{
 for(const prefix of ["Don't",'Don’t']){
  const captured=captureJourneyBrief(`${prefix} start in Rome on 10 May 2027. ${prefix} finish in Venice on 22 May 2027.`);
  assert.deepEqual(captured.structuredBrief.dates,{});
 }
});
