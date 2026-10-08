import {geographicContextMentionIds, normalizePlacePhrase} from './place-intelligence.ts';
import type {CanonicalEasyTTrip} from './trip.ts';

/** Pure eligibility proof. Reading a saved document never performs correction. */
export function eligibleCountryContextIntentIds(trip: CanonicalEasyTTrip): string[] {
  const brief=trip.brief.structuredBrief;
  if(!brief?.source.rawPrompt || !brief.source.inputs.includes('prompt'))return [];
  const mentions=brief.placeMentions??[],route=trip.brief.intent.route;
  const context=geographicContextMentionIds(brief.source.rawPrompt,mentions,route.origin?[route.origin]:[]);
  return route.destinations.filter(intent=>{
    const mention=mentions.find(m=>m.mentionId===intent.id);
    if(!mention || mention.placeType!=='country' || !context.has(intent.id) || intent.kind!=='planning_area'
      || Object.keys(intent).some(key=>!['id','kind','sourceText','selectedPlace','resolution','requestedNights','routeMembership','stopIds'].includes(key))
      || intent.routeMembership!=='required' || intent.stopIds.length || intent.requestedNights!==null || intent.resolution!=='needs_base'
      || intent.sourceText!==mention.sourceText || intent.selectedPlace?.name!==mention.canonicalName || intent.selectedPlace?.canonicalPlaceId!==mention.canonicalPlaceId
      || intent.selectedPlace?.providerId || intent.selectedPlace?.coordinates
      || mention.provenance.some(p=>p.kind==='builder')
      || brief.placeSelections?.some(s=>s.mentionId===intent.id)
      || brief.completedPlanningAreaMentionIds?.includes(intent.id)
      || brief.countryDiscoveryChoices?.[intent.id]?.length
      || (trip.brief.selectedPlaces[intent.id]??[]).length
      || brief.destinations.some(d=>d.placeMentionId===intent.id && d.provenance.source!=='prompt'))return false;
    const draft=brief.discoveryDraftByMentionId?.[intent.id];
    if(draft && (draft.version!==1 || draft.step!=='places' || Object.keys(draft).some(key=>!['version','step','removedIds','directionId','reviewState','shortlistIds','baseByIntentId','visitBaseByIntentId'].includes(key)) || !Array.isArray(draft.shortlistIds) || !Array.isArray(draft.removedIds) || !draft.baseByIntentId || !draft.visitBaseByIntentId || draft.shortlistIds.length || draft.removedIds.length || draft.directionId
      || Object.keys(draft.baseByIntentId).length || Object.keys(draft.visitBaseByIntentId).length
      || draft.reviewState!=='editing'))return false;
    const country=normalizePlacePhrase(mention.canonicalName);
    const refers=(value:unknown):boolean=>{
      if(Array.isArray(value))return value.some(refers);
      if(!value || typeof value!=='object')return false;
      const record=value as Record<string,unknown>;
      return record.canonicalPlaceId===mention.canonicalPlaceId || record.mentionId===intent.id
        || record.placeMentionId===intent.id || record.intentId===intent.id
        || Object.values(record).some(refers);
    };
    const namesCountry=(value:string)=>` ${normalizePlacePhrase(value)} `.includes(` ${country} `);
    const authoredText=(value:unknown):boolean=>{
      if(Array.isArray(value))return value.some(authoredText);
      if(!value||typeof value!=='object')return false;
      return Object.entries(value).some(([key,child])=>['title','label','name','location','notes'].includes(key)
        && (typeof child==='string'?namesCountry(child):Array.isArray(child)&&child.some(v=>typeof v==='string'&&namesCountry(v))) || authoredText(child));
    };
    if(trip.brief.intent.hardConstraints.fixedCommitments.some(c=>refers(c)||namesCountry(c.label))
      || brief.hardConstraints.some(c=>refers(c)||c.type==='must-visit' && normalizePlacePhrase(c.value)===country)
      || refers(trip.brief.itineraryIdeas??[]) || authoredText(trip.brief.itineraryIdeas??[])
      || refers(trip.brief.mapPins??[]) || authoredText(trip.brief.mapPins??[])
      || refers(trip.brief.retainedAuthoredContent??{}) || authoredText(trip.brief.retainedAuthoredContent??{})
      || trip.brief.bookings?.some(b=>refers(b)||[b.title,b.location??'',...(b.notes??[])].some(namesCountry))
      || trip.planItems.some(item=>item.notes.some(namesCountry))
      || Object.values(trip.brief.dayNotes??{}).flat().some(namesCountry)
      || Object.values(trip.brief.customActivities??{}).flat().some(namesCountry))return false;
    return true;
  }).map(intent=>intent.id);
}

/** A later authored country choice remains actionable even if its old source was context. */
export function preserveAuthoredCountryContextIntents(trip: CanonicalEasyTTrip, context: ReadonlySet<string>) {
  const eligible=new Set(eligibleCountryContextIntentIds(trip));
  const protectedIds=new Set(trip.brief.intent.route.destinations.filter(i=>context.has(i.id)&&!eligible.has(i.id)).map(i=>i.id));
  return new Set([...context].filter(id=>!protectedIds.has(id)));
}
