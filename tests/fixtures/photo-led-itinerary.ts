import {japanTrip} from './transport-choice.ts';
import {insertItineraryActivity} from '../../lib/easyt/itinerary-mutations.ts';
import {upsertStayBooking} from '../../lib/easyt/accommodation.ts';

export function photoLedItineraryTrip() {
  let trip = japanTrip();
  trip.planItems = Array.from({length: 7}, (_, i) => ({...trip.planItems[0], id: `day-${i+1}`, dayNumber: i+1, date: `2027-04-0${i+1}`, stopId: i < 3 ? 'tokyo' : 'kyoto', type: i === 3 ? 'transport' as const : 'open' as const, title: i === 3 ? 'Tokyo to Kyoto' : i < 3 ? 'Tokyo' : 'Kyoto', notes: []}));
  for (let n=1;n<=7;n++) for (const [part,title] of [['morning','Neighbourhood walk'],['afternoon','Garden visit'],['evening','Local dinner']] as const) {
    trip = insertItineraryActivity(trip,n,trip.planItems[n-1].notes.length,title,part).trip;
  }
  return upsertStayBooking(trip, 'kyoto', {title:'Kyoto test stay'});
}
