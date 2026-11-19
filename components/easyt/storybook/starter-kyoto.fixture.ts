import { defaultTripIntent, type EasyTTrip } from "@/lib/easyt/trip";
import type { ActivityInventoryItem } from "@/lib/easyt/activity-inventory";

// Story-only specimens: photographs are local project assets, not real Viator products.
const stop = "kyoto";
export const starterKyotoFixture: EasyTTrip = {
  schemaVersion: 1, id:"starter-kyoto-preview", ownerId:null, title:"Kyoto", status:"planned",
  startDate:"2027-03-10",endDate:"2027-03-14",travellers:2,currency:"GBP",
  brief:{origin:"Tokyo",mustDo:"",pace:"slow",hotelChanges:"few",budgetBand:"mid",selectedPlaces:{},intent:defaultTripIntent({stopIds:[stop],durationDays:5})},
  stops:[{id:stop,canonicalPlaceId:stop,name:"Kyoto",country:"Japan",countryCode:"JP",order:0,nights:4,latitude:35.0116,longitude:135.7681,arrivalDate:"2027-03-10",departureDate:"2027-03-14"}],
  legs:[],planItems:[10,11,12,13,14].map((n,i)=>({id:`day-${i+1}`,stopId:stop,dayNumber:i+1,date:`2027-03-${n}`,type:"activity",title:"Explore Kyoto",reason:"",notes:[],startsAt:null,endsAt:null,bookingUrl:null,latitude:null,longitude:null})),
  recommendations:[],createdAt:"2026-11-19T00:00:00Z",updatedAt:"2026-11-19T00:00:00Z",
};
export const starterKyotoCards: ActivityInventoryItem[] = [
  ["fushimi","Fushimi Inari Taisha"],["arashiyama","Arashiyama Bamboo Grove"],["no-photo","Nishiki Market"],
].map(([id,title])=>({provider:"viator",source:"viator",providerProductId:`storybook-${id}`,title:title!,destination:{canonicalPlaceId:stop,label:"Kyoto"},
  ...(id !== "no-photo" ? {image:`/journey/immersive/day-kyoto-${id}-768.webp`} : {}),
  provenance:{kind:"live_provider_search",provider:"viator",checkedAt:"2026-11-19T00:00:00Z"},
}));
