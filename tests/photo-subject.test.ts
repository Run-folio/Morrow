import assert from 'node:assert/strict';
import test from 'node:test';
import {isRepresentativeDestinationScene} from '../lib/easyt/photo-subject.ts';
test('park and garden settings need explicit wider destination scenery',()=>{
 for(const text of ['City park Pedion toy Areos in 2023','Athens city park','Garden in Manila','Graffiti bench in Athens','Bench overlooking Athens skyline'])assert.equal(isRepresentativeDestinationScene(text),false,text);
 for(const text of ['Athens skyline from a city park','Garden with palace architecture','Coastal landscape','Manila waterfront panorama with distant benches','Tokyo, Japan'])assert.equal(isRepresentativeDestinationScene(text),true,text);
});

test('server scoring rejects exact old Athens park metadata while retaining wider city scenes',async()=>{
 const {scorePublishedRouteImageCandidate}=await import('../lib/easyt/published-route-image-pipeline.ts');
 const stop={key:'athens',name:'Athens',country:'Greece',coordinates:[23.7275,37.9838] as [number,number],routeKeys:[],siblingNames:[],attachedLandmarks:[]};
 const photo={provider:'wikimedia' as const,id:'File:Pedion you areas Athens Greece 2.jpg',src:'https://upload.wikimedia.org/wikipedia/commons/4/45/Pedion_you_areas_Athens_Greece_2.jpg',sourceUrl:'https://commons.wikimedia.org/wiki/File:Pedion_you_areas_Athens_Greece_2.jpg',author:'Ozanp689',license:'CC0',licenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',width:1600,height:900};
 const oldCaption='City park Pedion toy Areos in 2023';
 const old=scorePublishedRouteImageCandidate(stop,{...photo,alt:oldCaption,description:`${photo.id} ${oldCaption}`});
 assert.equal(old.accepted,false);assert.ok(old.concerns.some(concern=>concern.includes('incidental park or bench')),'old metadata fails the shared subject gate');
 const wider=scorePublishedRouteImageCandidate(stop,{...photo,alt:'Athens Greece skyline panorama viewed from a city park',description:'Athens Greece skyline panorama viewed from a city park'});
 assert.equal(wider.accepted,true);
 const bench=scorePublishedRouteImageCandidate(stop,{...photo,alt:'Graffiti bench in Athens Greece city park',description:'Graffiti bench overlooking Athens Greece skyline'});
 assert.equal(bench.accepted,false);assert.ok(bench.concerns.some(concern=>concern.includes('incidental park or bench')));
});

test('events, protest and portrait subjects cannot use destination landmarks as scenery evidence',async()=>{
 const exact='Students marching in Milan for the pre-cop26 at Fridays for Future rally. In this picture you can see the stock exchange palace of Milano being covered with red paint.';
 for(const caption of [exact,'Portrait of a protester beside Milan palace','Selfie at Milan cathedral','Concert crowd in front of Milan cathedral','Wedding portrait in Venice waterfront'])assert.equal(isRepresentativeDestinationScene(caption),false,caption);
 for(const caption of ['Ordinary street crowd walking along a Milan street','Milan street architecture with people walking','Milan skyline with a distant parade in the background'])assert.equal(isRepresentativeDestinationScene(caption),true,caption);
 const {scorePublishedRouteImageCandidate}=await import('../lib/easyt/published-route-image-pipeline.ts');
 const scored=scorePublishedRouteImageCandidate({key:'milan',name:'Milan',country:'Italy',coordinates:[9.19,45.46],routeKeys:[],siblingNames:[],attachedLandmarks:[]},{provider:'wikimedia',id:'File:Milan Italy rally.jpg',src:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Milan.jpg',sourceUrl:'https://commons.wikimedia.org/wiki/File:Milan.jpg',author:'Fixture author',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',width:1600,height:900,alt:exact,description:exact,location:{country:'Italy'}});
 assert.equal(scored.accepted,false);
});
