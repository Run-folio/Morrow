import assert from "node:assert/strict";
import test from "node:test";
import * as workspace from "../lib/easyt/stay-workspace.ts";
import { recommendationDetailForStayResult } from "../lib/easyt/recommendation-detail.ts";
import { shortlistStay } from "../lib/easyt/trip-starter.ts";
import { selectMappedStayForStop } from "../lib/easyt/accommodation.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";
import type { JourneyLocalPlace } from "../lib/easyt/local-place.ts";

const trip = (): EasyTTrip => ({ schemaVersion: 1, id: "handoff", ownerId: null, title: "Tokyo return", status: "planned", startDate: "2027-03-03", endDate: "2027-03-11", travellers: 2, currency: "GBP", brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} }, stops: [
  { id: "first", order: 0, name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", latitude: 35.68, longitude: 139.7, arrivalDate: "2027-03-03", departureDate: "2027-03-06", nights: 3 },
  { id: "return", order: 1, name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", latitude: 35.68, longitude: 139.7, arrivalDate: "2027-03-09", departureDate: "2027-03-11", nights: 2 },
], legs: [], planItems: [{id:"return-day",stopId:"return",dayNumber:7,date:"2027-03-09",type:"activity",title:"Tokyo",reason:"",notes:[],startsAt:null,endsAt:null,bookingUrl:null,latitude:null,longitude:null}], recommendations: [], createdAt: "2026-11-10T00:00:00Z", updatedAt: "2026-11-10T00:00:00Z" });
const place: JourneyLocalPlace = { id: "hotel-a", name: "Hotel A", address: "Shinjuku, Tokyo", category: "hotel", coordinates: [139.7, 35.68], mapsUrl: "https://www.openstreetmap.org/", availability: "check", provider: "openstreetmap" };

test("copy details retain the exact return-stop dates without changing the trip", () => {
  const value = trip(); const before = JSON.stringify(value);
  assert.equal(typeof workspace.stayHandoffDetails, "function", "stay detail copy projection is available");
  assert.equal(workspace.stayHandoffDetails(value, "return", place), "Hotel: Hotel A\nLocation: Tokyo, Japan\nAddress: Shinjuku, Tokyo\nCheck-in: 2027-03-09\nCheck-out: 2027-03-11\nTravellers: 2");
  assert.equal(JSON.stringify(value), before);
});

test("unknown dates and travellers are not invented for the partner search", () => {
  const value = trip(); value.startDate = ""; value.endDate = ""; value.travellers = 0;
  assert.equal(typeof workspace.stayHandoffDetails, "function");
  assert.equal(workspace.stayHandoffDetails(value, "return", {...place,address:""}), "Hotel: Hotel A\nLocation: Tokyo, Japan\nDates to confirm");
  assert.equal(workspace.stayHandoffDetails(value, "missing-stop", place), null);
});

test("shortlist and selection never present an unconfirmed stay as booked", () => {
  const value = shortlistStay(trip(), "return", place);
  const detail = (t: EasyTTrip) => recommendationDetailForStayResult({trip:t,place,stayContext:workspace.stayWorkspaceContext(t,"return")!,surface:"stay"});
  assert.equal(detail(value).bookingStatus, "Shortlisted · Not booked");
  const chosen = selectMappedStayForStop(value,"return",place);
  assert.equal(detail(chosen).bookingStatus, "Selected · Not booked");
  assert.equal(detail(trip()).bookingStatus, "Not booked");
  const firstStop = recommendationDetailForStayResult({trip:value,place,stayContext:workspace.stayWorkspaceContext(value,"first")!,surface:"stay"});
  assert.equal(firstStop.bookingStatus,"Not booked", "a shortlist for a repeated stop is scoped to that occurrence");
});

test("a confirmed recorded stay without a map pin is not contradicted or matched by another hotel title", () => {
  const value = trip();
  value.brief.bookings = [{id:"stay-return",type:"stay",title:"Hotel A",date:"2027-03-09",confirmation:"CONFIRMED-TEST",url:null}];
  const detail = (p: JourneyLocalPlace) => recommendationDetailForStayResult({trip:value,place:p,stayContext:workspace.stayWorkspaceContext(value,"return")!,surface:"stay"});
  assert.equal(detail(place).bookingStatus,"Booking recorded · verify property");
  assert.equal(detail({...place,id:"another",name:"Hotel B"}).bookingStatus,"Not booked");
});
