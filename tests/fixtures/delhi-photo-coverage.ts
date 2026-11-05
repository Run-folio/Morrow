import {japanTrip} from './transport-choice.ts';
import {requireReadableTripDocument} from '../../lib/easyt/trip-document.ts';

/** Synthetic long single-base trip for explicit photo-exhaustion coverage. */
export function delhiCoverageTrip(){
 const trip=japanTrip();trip.id='trip-delhi-photo-coverage';trip.title='Delhi coverage review';trip.startDate='2027-04-01';trip.endDate='2027-04-29';trip.legs=[];
 trip.stops=[{id:'delhi',name:'Delhi',country:'India',order:0,latitude:28.6139,longitude:77.209,arrivalDate:trip.startDate,departureDate:trip.endDate,nights:28}];
 trip.brief={origin:'Delhi',mustDo:'',pace:'slow',hotelChanges:'some',budgetBand:'mid',selectedPlaces:{},customActivities:{}};
 trip.planItems=Array.from({length:29},(_,i)=>{
  const notes=['Neighbourhood walk','Local lunch','Evening stroll'];trip.brief.customActivities![i+1]=[...notes];
  return {...trip.planItems[0],id:`delhi-day-${i+1}`,stopId:'delhi',dayNumber:i+1,date:`2027-04-${String(i+1).padStart(2,'0')}`,type:'open' as const,title:'Delhi',notes,noteDayParts:['morning' as const,'midday' as const,'evening' as const],contextNotes:[],image:null,sourceUrl:null};
 });
 return requireReadableTripDocument(trip);
}
