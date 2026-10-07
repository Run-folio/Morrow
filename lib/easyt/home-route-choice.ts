import type { HomepageInputSnapshot, HomepageTripType } from "./home-trip-handoff.ts";
import type { JourneyCaptureResult } from "./journey-capture.ts";
import { capturedEndpointConflict } from "./place-intelligence.ts";
import type { JourneyEndSelection, JourneyEndpointPlace, RouteIntent } from "./trip.ts";
import { normalizeJourneyEnd, sameJourneyPlace } from "./journey-endpoints.ts";

export type HomepageRouteEvidence = {
  tripType: HomepageTripType | null;
  journeyEnd: JourneyEndSelection;
  status: "clear" | "unknown" | "requires_review";
  source: "capture" | "legacy";
};

const semanticText = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
const oneWayTrip = /\b(?:one[ -]way\s+(?:trip|journey|route)|(?:trip|journey|route)\s+(?:(?:is|will be|should be)\s+)?one[ -]way|(?:viaje|ruta|recorrido)\s+(?:(?:es|sera)\s+)?(?:de\s+)?solo\s+ida)\b/;
const returnTrip = /\b(?:round[ -]trip\s+(?:trip|journey|route)|(?:trip|journey|route)\s+(?:is\s+)?round[ -]trip|(?:viaje|ruta|recorrido)\s+(?:de\s+)?ida\s+y\s+vuelta)\b/;
const uncertain = /\b(?:maybe|might|perhaps|possibly|not sure|whether|not|do not|don't|dont|won't|wont|wouldn't|wouldnt|never|against|without|instead of|rather than|if|unless|should|would|could|may|no|nunca|si|podria|deberia|seria|quizas|tal vez)\b/;

function affirmativeTripClaim(clause: string): boolean {
  const cue = oneWayTrip.exec(clause) ?? returnTrip.exec(clause);
  if (!cue) return false;
  const prefix = clause.slice(0, cue.index).trim();
  // A trip noun phrase, an affirmative statement, or a deliberate planning
  // request can declare intent. Mentioning an alternative does not declare it.
  if (/^(?:a|an|the|my|our|this|un|mi|nuestro|el|este)?$/.test(prefix)) return true;
  return /^(?:(?:i|we)\s+(?:want|want to plan|want to take|will take|am taking|are taking|am planning|are planning)|(?:i'd|we'd)\s+like|(?:plan|make|build)|(?:quiero|queremos|planea|planifica)|(?:me|nos)\s+gustaria)\s*(?:(?:a|an|the|my|our|un|mi|nuestro)\s*)?$/.test(prefix);
}

export function homepageCapturedRouteEvidence(prompt: string, capture?: Pick<JourneyCaptureResult, "journeyEnd"> & Partial<Pick<JourneyCaptureResult, "mentions">>): HomepageRouteEvidence {
  const journeyEnd = normalizeJourneyEnd(capture?.journeyEnd);
  const clauses = (semanticText(prompt).match(/[^.!?;\n]+[.!?;]?/g) ?? []).filter(clause => oneWayTrip.test(clause) || returnTrip.test(clause)
    || (uncertain.test(clause) && /\bsolo ida\b/.test(clause) && !/\b(?:billete|boleto|ticket|vuelo)\b/.test(clause)));
  const negativeOrUnclear = clauses.some(clause => uncertain.test(clause) || /[?¿]/.test(clause) || !affirmativeTripClaim(clause));
  const oneWay = clauses.some(clause => oneWayTrip.test(clause));
  const returning = clauses.some(clause => returnTrip.test(clause));
  const contradicts = (oneWay && returning) || (oneWay && journeyEnd.mode === "same_as_start") || (returning && journeyEnd.mode === "explicit");
  if (negativeOrUnclear || contradicts || (capture?.mentions && capturedEndpointConflict(capture.mentions))) return { tripType: null, journeyEnd, status: "requires_review", source: "capture" };
  const tripType = oneWay ? "one_way" : returning ? "return_to_start"
    : journeyEnd.mode === "explicit" ? "one_way" : journeyEnd.mode === "same_as_start" ? "return_to_start" : null;
  return { tripType, journeyEnd: returning && journeyEnd.mode === "unknown" ? { mode: "same_as_start" } : journeyEnd,
    status: tripType ? "clear" : "unknown", source: "capture" };
}

function placeMeaning(place: JourneyEndpointPlace | null) {
  if (!place) return null;
  return place.canonicalPlaceId ? { canonicalPlaceId: place.canonicalPlaceId }
    : { name: semanticText(place.name), country: semanticText(place.country ?? ""), providerId: place.providerId ?? null };
}

function inputMeaning(snapshot: HomepageInputSnapshot) {
  return {
    owner: snapshot.ownerId,
    mode: snapshot.mode,
    prompt: snapshot.mode === "describe" ? semanticText(snapshot.prompt) : "",
    origin: snapshot.origin.state === "selected" ? placeMeaning(snapshot.origin.value) : snapshot.origin.state,
    originInput: snapshot.origin.state === "selected" ? "" : semanticText(snapshot.originInput ?? ""),
    type: snapshot.tripType ?? null,
  };
}

export function homepageDescribeSourceKey(snapshot: HomepageInputSnapshot): string {
  return JSON.stringify([snapshot.ownerId, snapshot.mode, semanticText(snapshot.prompt)]);
}

export function homepageRouteReviewKey(snapshot: HomepageInputSnapshot, evidence: HomepageRouteEvidence): string {
  return JSON.stringify({ version: 1, input: inputMeaning(snapshot), type: evidence.tripType, status: evidence.status,
    end: evidence.journeyEnd.mode === "explicit" ? { mode: "explicit", place: placeMeaning(evidence.journeyEnd.place) } : evidence.journeyEnd });
}

export function invalidateHomepageRouteReview(previous: HomepageInputSnapshot, next: HomepageInputSnapshot): HomepageInputSnapshot {
  if (!next.routeReview || JSON.stringify(inputMeaning(previous)) === JSON.stringify(inputMeaning(next))) return next;
  const { routeReview: _review, ...editable } = next;
  return editable;
}

export function homepageRouteChoice(snapshot: HomepageInputSnapshot, evidence?: HomepageRouteEvidence): {
  tripType: RouteIntent["tripType"];
  journeyEnd: JourneyEndSelection;
  source: "selected" | "capture" | "default" | "legacy";
  conflict: "endpoint" | "trip_type" | null;
} {
  const knownEnd = snapshot.journeyEnd.state === "selected" ? normalizeJourneyEnd(snapshot.journeyEnd.value) : { mode: "unknown" as const };
  const observed: HomepageRouteEvidence = evidence ?? { tripType: null, journeyEnd: knownEnd,
    status: knownEnd.mode === "unknown" ? "unknown" : "clear", source: "legacy" };
  const selectedType = snapshot.tripType?.state === "selected" ? snapshot.tripType.value : null;
  const declaredType = selectedType ?? (knownEnd.mode === "explicit" ? "one_way" : knownEnd.mode === "same_as_start" ? "return_to_start" : null);
  const acceptedReview = selectedType && snapshot.routeReview?.acceptedTripType === selectedType
    && snapshot.routeReview.reviewedInputKey === homepageRouteReviewKey(snapshot, observed);
  const end = knownEnd.mode !== "unknown" ? knownEnd : observed.journeyEnd;
  const origin = snapshot.origin.state === "selected" ? snapshot.origin.value : null;
  const explicitEnd = observed.journeyEnd.mode === "explicit" ? observed.journeyEnd : end.mode === "explicit" ? end : null;
  const explicitConflict = explicitEnd && (!origin || !sameJourneyPlace(origin, explicitEnd.place));
  const differingFinish = knownEnd.mode === "explicit" && observed.journeyEnd.mode === "explicit"
    && !sameJourneyPlace(knownEnd.place, observed.journeyEnd.place);
  const sourceOneWayClaim = snapshot.mode === "describe" && homepageCapturedRouteEvidence(snapshot.prompt).tripType === "one_way";
  const conflict = !acceptedReview && (observed.status === "requires_review" || differingFinish || (declaredType === "return_to_start"
    && (explicitConflict || sourceOneWayClaim)) || (declaredType === "one_way"
    && (end.mode === "same_as_start" || observed.tripType === "return_to_start")))
    ? explicitConflict || differingFinish ? "endpoint" as const : "trip_type" as const : null;
  if (selectedType) return { tripType: selectedType,
    journeyEnd: selectedType === "return_to_start" ? { mode: "same_as_start" } : end.mode === "explicit" ? end : { mode: "unknown" },
    source: "selected", conflict };
  if (knownEnd.mode !== "unknown") return { tripType: knownEnd.mode === "explicit" ? "one_way" : "return_to_start", journeyEnd: knownEnd, source: "legacy", conflict };
  if (observed.status === "clear" && observed.tripType) return { tripType: observed.tripType, journeyEnd: observed.journeyEnd, source: "capture", conflict };
  if (snapshot.mode === "stops" && snapshot.tripType?.state === "untouched" && !conflict) return { tripType: "return_to_start", journeyEnd: { mode: "same_as_start" }, source: "default", conflict };
  return { tripType: "unknown_legacy", journeyEnd: { mode: "unknown" }, source: "legacy", conflict };
}
