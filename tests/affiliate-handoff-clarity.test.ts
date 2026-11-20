import assert from "node:assert/strict";
import test from "node:test";
import * as booking from "../lib/easyt/booking-readiness.ts";
import { buildOmioRouteSearchLink } from "../lib/easyt/omio-search-link.ts";
test("Omio handoff explicitly asks to check party size without inventing passenger parameters",()=>{
 assert.equal(typeof booking.affiliateHandoffDetail,"function");
 const href=buildOmioRouteSearchLink({mode:"train",originName:"Tokyo",originCountry:"Japan",destinationName:"Kanazawa",destinationCountry:"Japan",departureDate:"2026-11-06",now:new Date("2026-11-03T12:00:00Z")})!;
 const a={provider:"omio",category:"transport" as const,href,cta:"Compare transport",affiliate:true as const};
 const handoff = booking.affiliateHandoffDetail(a)!;
 assert.match(handoff, /Omio gets your route and dates, not your traveller count/);
 assert.match(handoff, /Set the count and check the transport mode before booking/);
 assert.match(booking.affiliateHandoffDetail({...a,href:booking.affiliatePartners.omio.transportUrl})!,/general.*route.*date.*traveller/i);
 const spanish = booking.affiliateHandoffDetail(a,"es")!;
 assert.match(spanish,/Omio recibe tu ruta y las fechas, pero no el número de viajeros/);
 assert.match(spanish,/Indica cuántas personas viajan y comprueba el medio de transporte antes de reservar/);
 assert.deepEqual([...new URL(new URL(href).searchParams.get("u")!).searchParams.keys()],["departurePosTerm","arrivalPosTerm","departureDate","travelMode","locale"]);
});
test("only the approved generic accommodation link claims generic handoff",()=>{
 assert.equal(typeof booking.affiliateHandoffDetail,"function");
 const a={provider:"trip.com",category:"accommodation" as const,href:booking.affiliatePartners.tripCom.accommodationUrl,cta:"Find accommodation",affiliate:true as const};
 assert.match(booking.affiliateHandoffDetail(a)!,/general.*hotel.*destination.*dates.*travellers/i);
 assert.equal(booking.affiliateHandoffDetail({...a,href:"https://example.com/hotel"}),null);
 assert.equal(booking.affiliateHandoffDetail({...a,provider:"viator"}),null);
 assert.equal(booking.getAccommodationBookingUrl({stop:{id:"tokyo",name:"Tokyo",country:"Japan"},dates:{checkIn:"2026-11-03",checkOut:"2026-11-05"},travellers:2}),a.href);
});
