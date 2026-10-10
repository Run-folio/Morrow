"use client";

import {referenceGeographicAcceptanceMatches} from '@/lib/easyt/place-reference';


/**
 * EasyT — new trip builder (v2 flow: Where → When → Places → Time → Draft)
 * Self-contained client component. Drop in at app/journey/new/trip-builder.tsx
 * and render <TripBuilder /> from page.tsx.
 *
 * Wire-up points marked TODO: geocode validation, place catalog, day imagery,
 * research pass. Everything else is complete.
 */

import {
  ArrowDown, ArrowUp, ChevronDown, ChevronRight,
  Check, FileSpreadsheet, GripVertical, Info, Lock, MapPin, Pencil, Plane, Plus, Route, Train, Trash2, X, CarFront, Ship, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useId, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { acknowledgeTripBuildSave, cacheCanonicalTrip, canUseHydratedTripScope, claimGuestTripRecoveryForOwner, EASYT_BEFORE_NEW_TRIP_EVENT, EASYT_LAST_OWNER_CHANGE_EVENT, EASYT_LAST_OWNER_KEY, EasyTTripAuthError, EasyTTripPromotionConflictError, EasyTTripSaveConflictError, forgetRememberedOwner, loadActiveTrip, loadCurrentDraftRecovery, loadRememberedOwner, loadRequestedTrip, loadTripRecovery, markTripRecoveryState, ownerIdForBrowserRecovery, rememberLastOwner, saveTripRecovery, saveTripRecoveryToEasyT, sameRecoveryDocument, shouldAllowNewTripNavigation, tripDocumentsCanonicalEquivalent, type TripRecoveryHandle } from "@/lib/easyt/storage";
import { canonicalTripStopIdentityMap, tripBuildDocumentsCanonicalEquivalent } from "@/lib/easyt/trip-promotion";
import { type BuilderAcceptedEdit, type BuilderStructuralSnapshot } from "@/lib/easyt/trip-builder-edit";
import { builderNightsCommand, builderRemoveCommand, builderPlaceCommand, builderDetailsCommands } from "@/lib/easyt/trip-builder-handler-contract";
import type { BuilderEditSession, BuilderEditSessionOptions, BuilderReconciliationRequest } from "@/lib/easyt/trip-builder-edit-session";
import { useBuilderEditSession } from "./use-builder-edit-session";
import { requireReadableTripDocument } from "@/lib/easyt/trip-document";
import { reconcileBuilderDependencies, type BuilderProjectionResponse } from "@/lib/easyt/trip-builder-reconciliation";
import { parseTypedLocalDate } from "@/lib/easyt/local-date";
import { TripBuilderTopControls } from "./trip-builder-top-controls";
import { TripBuilderRouteProposal } from "./trip-builder-route-proposal";
import { acceptBuilderOptimization, calculateBuilderOptimization, type BuilderOptimizationResult } from "@/lib/easyt/trip-builder-route-proposal";
import { routeProjectionInputKey } from "@/lib/easyt/trip-route-intent";
import { allRequiredStaysHaveNights } from "@/lib/easyt/trip-builder-generated-nights";
import { projectBuilderCalendar } from "@/lib/easyt/trip-builder-calendar";
import { resolveBuilderRecommendation } from "@/lib/easyt/trip-builder-recommendations";
import { readBuilderInputDraft, writeBuilderInputDraft, type BuilderInputBinding } from "@/lib/easyt/trip-builder-input-draft";
import { EasyTTripPersistenceError, isTripPersistenceAuthenticationError, tripRecoveryStateForPersistenceError } from "@/lib/easyt/trip-persistence-error";
import { tripEditorSyncAction, tripSyncRecoveryPath, tripSyncSignInPath } from "@/lib/easyt/trip-continuity";
import { routeIntentFromHandoff } from "@/lib/easyt/trip-route-intent";
import { eligibleCountryContextIntentIds, preserveAuthoredCountryContextIntents } from "@/lib/easyt/trip-country-context";
import { routeIntentForAcceptedBuilderOrder } from "@/lib/easyt/trip-builder-order";
import { defaultTripIntent, fixedTripCommitmentsFromStructuredBrief, isEasyTTrip, tripFromBuilder, tripIntentForTrip, type EasyTTrip, type FixedTripCommitment, type JourneyEndSelection, type JourneyEndpointPlace, type TripBudgetPreference, type TripDecisionSelections, type TripIntent, type TripIntentPace, type TripLeg, type TripScheduleLocks, type TripStatus, type TripStop, type TripTransportMode } from "@/lib/easyt/trip";
import { arrivalLoadFromTransfer, assessRouteIntelligence, buildCredibleItinerary, estimateLegForConstraints, routeIntelligenceForPersistence, routeTransferSavingMinutes, travelStayConsequence, usableStopDays, type PlannedDay, type PlannerPlace } from "@/lib/easyt/planner";
import { allocateTripNights, calendarDayAllocationsFromNights, rebalanceTripNights, tripNightsBetween, type NightAllocationStopInput } from "@/lib/easyt/night-allocation";
import { classifyAnalyticsSaveError, hasAnalyticsConsent, trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import type { JourneyImage } from "@/lib/journey";
import { mediaImagesFor, PLACE_IMAGE_HINTS } from "@/lib/easyt/itinerary-media";
import styles from "./trip-builder.module.css";
import mobilePolish from "./trip-builder-mobile.module.css";
import { countryDiscoveryCandidatePresentation, discoveryPendingDecisionLabel, easytCopy, languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { inspirationByKey } from "@/lib/easyt/inspiration";
import { publicRouteDetailFor } from "@/lib/easyt/public-route";
import { routePlannerPayload } from "@/lib/easyt/public-route-handoff";
import { defaultTravelProfile, travelProfileFromUnknown, tripInterestsWithProfileDefaults, type TravelProfile } from "@/lib/easyt/travel-profile";
import { firstTripWorkspaceHref, mapWorkspaceHref, stayWorkspaceHref, tripWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import { createLatestJourneyCaptureRequestGate, journeyCaptureFailureMessage, requestJourneyCapture } from "@/lib/easyt/journey-capture-client";
import { homepageCapturedRouteEvidence, homepageDescribeSourceKey, newTripCapturedJourneyEnd } from "@/lib/easyt/home-route-choice";
import { HOME_TRIP_DRAFT_KEY, retainPendingIntakeReview, acknowledgePendingIntakeReceipt, createHandoffSharedLookup, discardPendingIntakeForEdit, handoffLookupMentions, handoffOutcomeIsCurrent, handoffStopOccurrenceId, homepageBuilderDateRange, homepageHandoffMatchesTrip, homepageHandoffReceiptForOwner, homepageReceiptForProjection, insertHandoffOccurrence, handoffCanonicalOccurrenceBindings, persistEditableHomepageInput, pendingReceiptStillCurrent, projectHomepageInput, readHomepageInput, pendingIntakeReceiptForOwner, pendingHomepageHandoffForOwner, reserveDirectDescribeIntake, retireHandoffResolutionStatus, homeTripDraftInterestsWereExplicit, homeTripDraftTimingFlexibility, initialHandoffRouteStops, mergeHandoffLocationChoice, preferredHandoffLocationChoice, removeHomeTripDraftIfDurable, resolveHandoffIncrementally, routableHandoffMentions, tripInterestsFromHomeDraft, type HandoffLocationChoice, type HomeTripDraft, type HomepageInputSnapshot, type PendingHomeTripHandoff, type PendingIntakeReceipt } from "@/lib/easyt/home-trip-handoff";
import { resolveNewTripEntryState, type NewTripEntryState } from "./new-trip-entry-state";
import { NewTripStarter } from "./new-trip-starter";
import type { JourneyCaptureResult } from "@/lib/easyt/journey-capture";
import { builderRouteInputIsReady, canBuildTrip, placeIssueNeedsAttention } from "@/lib/easyt/can-build-trip";
import { validateFinalPlan } from "@/lib/easyt/plan-validator";
import { transferImpactFromMetadata } from "@/lib/easyt/transfer-impact";
import { createDestinationKnowledgeStore, destinationKnowledge } from "@/lib/easyt/destination-knowledge";
import { buildCountryDiscovery, updateCountryDiscoveryChoice } from "@/lib/easyt/country-discovery";
import type {CanonicalEasyTTrip} from '@/lib/easyt/trip';
import { acceptedGeographicPlace, geographicCandidateMatches, geographicInputKey, geographicallyReady, stopGeographicPlace, validatedPlaceCoordinates, guardTripRoutingGeometry } from '@/lib/easyt/geographic-binding';
import { countryCodeFor } from "@/lib/easyt/country-registry";
import { findCatalogPlaceById } from "@/lib/easyt/place-catalog";
import { extractStructuredTripBrief, mergeStructuredTripBrief, routeConstraintsFromStructuredTripBrief, routeScoringPreferencesFromStructuredBrief, structuredTripBriefFromSavedSelections, type StructuredTripBrief } from "@/lib/easyt/structured-trip-brief";
import { geographicContextMentionIds, OVERNIGHT_BASE_PLACE_TYPES, PLACE_INTELLIGENCE_PARSER_VERSION, PLACE_INTELLIGENCE_VERSION, appendSelectedPlanningAreaMention, confirmedAttractionVisitSelection, canonicalPlaceFactsMatch, validPlaceCoordinates, canonicalPlaceSuggestionFor, canonicalPlaceSuggestionSuitableAsNearbyBase, canonicalPlaceSuggestionsForQuery, guidedPlanningAreaShapes, guidedPlanningAreaSuggestions, inferAttractionVisitSelections, isOvernightBaseEligible, nearbyBaseAnchorForMention, nearbyBaseSearchPreposition, placeCandidateSuitableAsNearbyBase, placeCandidateWithinPlanningParent, placeMentionSupportsMultipleSelections, placeMentionsNeedingReview, placeResolutionIssuesForMentions, placeSuggestionRequiresBaseSelection, planningAreaSuggestionsWithinParent, rankAttractionVisitTargets, regionalBaseSuggestions, selectPlaceCandidate, selectPlaceSearchSuggestion, type AttractionVisitCandidate, type CanonicalPlaceSuggestion, type GuidedPlanningAreaShape, type GuidedPlanningAreaSuggestion, type NearbyBaseSuggestion, type PlaceIntelligenceResult, type PlaceIssue, type PlaceIssueOption, type PlaceSelection, type PlaceType, type PlanningParentConstraint, type ResolvedPlaceMention } from "@/lib/easyt/place-intelligence";
import { isDuplicatePlaceIdentity, placeSuggestionLocationDetail } from "@/lib/easyt/place-autocomplete";
import { requiresPhysicalIslandVerification } from "@/lib/easyt/island-geography";
import { verifyPhysicalIslandSuggestion } from "@/lib/easyt/destination-resolution";
import { MorroviaTripCapture } from "@/components/easyt/morrovia-trip-capture";
import { CanonicalPlaceAutocomplete } from "@/components/easyt/canonical-place-autocomplete";
import { JourneyEndpointsEditor } from "@/components/easyt/journey-endpoints-editor";
import { TripBuilderDetailsEditor, type TripBuilderDetailsDraft } from "./trip-builder-details-editor";
import { TripBuilderRouteWorkspace, type BuilderOrderSource } from "./trip-builder-route-workspace";
import { builderNightAllocationLabel } from "./builder-night-allocation-label";
import { BuilderClarificationDialog, BuilderClarificationResume, type BuilderClarificationChoice, type BuilderClarificationRouteShape, type BuilderClarificationSelectedPlace, type BuilderClarificationSuggestion } from "@/components/easyt/builder-clarification-dialog";
import { DiscoveryModal } from "@/components/easyt/discovery-modal";
import { discoveryEntryForBrief, type DiscoveryEntry } from "@/lib/easyt/discovery-entry";
import { readDiscoveryDraft, reduceDiscoveryDraft, selectCanonicalSearchResult } from "@/lib/easyt/discovery-draft";
import { buildDiscoveryReview } from "@/lib/easyt/discovery-review";
import { commitDiscoveryReview, completeDiscoveryMention } from "@/lib/easyt/discovery-commit";
import { discoveryBaseForSearchedArea, discoveryClarificationSearchCanAdd, discoverySearchOutsideMention, discoverySearchStopSuggestion } from "@/lib/easyt/discovery-confirmation";
import { flushSync } from "react-dom";
import { projectDiscovery } from "@/lib/easyt/discovery-projection";
import { discoveryProjectionKey } from "@/lib/easyt/discovery-projection-key";
import { discoveryChoiceEvent, discoveryConfirmedEvent, discoveryDismissedEvent } from "@/lib/easyt/discovery-funnel";
import { discoveryBaseSuitableForMention, discoveryPlaceWithinMention } from "@/lib/easyt/discovery-content";
import { PRODUCT_TOUR_STATE_EVENT } from "@/components/easyt/easyt-product-tour";
import { EasyTButton, EasyTField, EasyTLinkButton, EasyTSelect } from "@/components/easyt/easyt-controls";
import { MorroviaDatePicker } from "@/components/easyt/morrovia-date-picker";
import { MorroviaQuantitySelector } from "@/components/easyt/morrovia-quantity-selector";
import { MorroviaBriefNotice, MorroviaConfirmationDialog, MorroviaRecoveryFeedback, MorroviaSaveStatus, MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import ResilientImage from "@/components/easyt/resilient-image";
import { MorroviaSectionStatus } from "@/components/easyt/morrovia-loading-states";
import { homepageInputStorageKey, travelProfileStorageKey } from "@/lib/easyt/private-browser-context";
import { curatedStopFor, reconcileCuratedRouteKnowledge, type CuratedRouteKnowledge } from "@/lib/easyt/curated-route-knowledge";
import { buildCanonicalTripLegs } from "@/lib/easyt/trip-legs";
import { transferJourneyModeLabel } from "@/lib/easyt/transfer-journey";
import { routeDestinationPhoto, routeImageCredit } from "@/lib/easyt/route-images";
import { preserveBuilderCanonicalState } from "@/lib/easyt/trip-builder-preservation";
import { builderDetailsFingerprint, prepareBuilderDocumentCommit } from "@/lib/easyt/trip-builder-document-commit";
import { currentBuilderRouteProposal, validateBuilderStopOrder } from "@/lib/easyt/trip-builder-order";
import { normalizeTripInterests, tripInterestLabels, type TripInterest } from "@/lib/easyt/trip-interest";
import { resolvedJourneyEndPlace, canonicalJourneyEndpointPlace, originPlaceFromBrief, isSameCanonicalPlace, journeyEndFromCapturedIntent, journeyEndpointIdentityIsCoherent, journeyEndpointPlaceFromSuggestion, normalizeJourneyEnd, plannerEndpointForJourneyEnd, resolveTypedJourneyEndpoint } from "@/lib/easyt/journey-endpoints";
import { builderClarificationProgress, builderClarificationRemovalPlan, builderClarificationResumeLabel, orderedBuilderClarificationIds, reviewedRouteStopSatisfiesMention, shouldAutoOpenBuilderClarification, shouldYieldBuilderClarification } from "@/lib/easyt/builder-clarification";
import { fixedCommitmentDisplayLabel, projectFixedCommitmentsToStops } from "@/lib/easyt/fixed-commitment";
import { createAbortableEffectScope } from "@/lib/easyt/abortable-effect";
import { withProviderTimeout } from "@/lib/easyt/provider-timeout";
import { hasUsefulRouteSkeleton } from "./trip-builder-entry";
import { markPlanningMilestone, planningAttemptOutcome, planningContentIsActionable, planningRequiredInterpretationIsComplete } from "@/lib/easyt/planning-attempt-performance";
import { durableBuilderRecoveryUrl } from "@/lib/easyt/builder-durable-url";
import { clearTripLegTransportChoice, selectTripLegTransportChoice } from "@/lib/easyt/transport-mode-choice";
import { authoredContentKey } from "@/lib/easyt/trip-retained-authored-content";

const TripItineraryWorkspace = dynamic(() => import("@/components/easyt/trip-itinerary-workspace"), {
  ssr: false,
  loading: () => <MorroviaSectionStatus title="Opening your trip" detail="Preparing the itinerary and map." />,
});

/* ---------------------------------------------------------------- data */

export type Place = PlannerPlace;
export type Stop = { id: string; name: string; country: string; canonicalPlaceId?: string; countryCode?: string; region?: string; providerId?: string; geographicBinding?:JourneyEndpointPlace['geographicBinding']; coordinates?: [number, number]; intent?: "place" | "landmark"; locality?: string };
type StructuralSnapshot = { canonical?: BuilderStructuralSnapshot; stops: Stop[]; allocations: Record<string, number>; manualNightStopIds: string[]; startDate: string; endDate: string; locks: TripScheduleLocks; placeSelections: PlaceSelection[]; completedPlanningAreaMentionIds: string[]; removedPlaceMentionIds: string[]; countryDiscoveryChoices?: Record<string, string[]>; discoveryDraftByMentionId?: StructuredTripBrief["discoveryDraftByMentionId"]; capturedPlaceSelections?: PlaceSelection[]; capturedDestinations: StructuredTripBrief["destinations"]; capturedMustVisit: StructuredTripBrief["mustVisit"]; summary: string };
type NightEditFeedback = { title: string; detail?: string; tone: "info" | "warning" };
type CapturedLocation = ResolvedPlaceMention;
type LocationChoice = HandoffLocationChoice;
type PlaceSelectionDraft = Omit<PlaceSelection, "mentionId" | "routeStopId">;
type NearbyBaseDiscoveryState = {
  mentionId: string;
  status: "loading" | "ready" | "empty" | "unavailable";
  suggestions: NearbyBaseSuggestion[];
};
const routeHandoffNightKnowledge = createDestinationKnowledgeStore({ destinations: [], transfers: [] });

function nightRebalanceFeedback(
  result: ReturnType<typeof rebalanceTripNights>,
  language: EasyTLanguage,
): NightEditFeedback | null {
  const moved = result.automaticChanges;
  const movedDetail = moved.length
    ? moved.map((change) => `${change.nights} ${change.nights === 1 ? "night" : "nights"} ${change.direction === "added" ? "to" : "from"} ${change.name}`).join(", ")
    : undefined;
  if (result.balanceDelta > 0) return {
    tone: "warning",
    title: language === "es" ? `${result.balanceDelta} ${result.balanceDelta === 1 ? "noche pendiente" : "noches pendientes"}` : `${result.balanceDelta} ${result.balanceDelta === 1 ? "night left" : "nights left"} to add`,
    detail: movedDetail ?? (language === "es" ? "Las opciones disponibles están demasiado igualadas para elegir una en silencio." : "The available destinations are too evenly matched for Morrovia to choose silently."),
  };
  if (result.balanceDelta < 0) return {
    tone: "warning",
    title: language === "es" ? `${Math.abs(result.balanceDelta)} ${Math.abs(result.balanceDelta) === 1 ? "noche por quitar" : "noches por quitar"}` : `${Math.abs(result.balanceDelta)} ${Math.abs(result.balanceDelta) === 1 ? "night needs" : "nights need"} to be removed`,
    detail: movedDetail ?? (language === "es" ? "Ninguna estancia desbloqueada puede reducirse con suficiente seguridad." : "No unlocked stay is a sufficiently clear safe donor."),
  };
  if (!moved.length) return null;
  const totalMoved = moved.reduce((total, change) => total + change.nights, 0);
  return {
    tone: "info",
    title: language === "es"
      ? `${totalMoved} ${totalMoved === 1 ? "noche redistribuida" : "noches redistribuidas"}`
      : `${totalMoved} ${totalMoved === 1 ? "night was" : "nights were"} rebalanced`,
    detail: language === "es"
      ? `${movedDetail}. Se mantuvo el total del viaje sin cambiar estancias protegidas.`
      : `${movedDetail}. The trip total stays balanced and protected stays were not changed.`,
  };
}

function canonicalArrivalLoad(leg: TripLeg | undefined): "light" | "substantial" | "travel-heavy" | "unknown" {
  return arrivalLoadFromTransfer({ usableDayLoss: leg?.usableDayLoss, durationMinutes: leg?.durationMinutes });
}

// TODO: replace with the live discovery API response.
const CATALOG: Record<string, Place[]> = {
  tokyo: [
    { title: "Asakusa & Senso-ji", area: "East Tokyo", type: "Landmark", cost: 0.5, tags: ["Cities"], description: "Old Tokyo atmosphere, best paired with a nearby food stop rather than a cross-city rush." },
    { title: "Meiji Jingu & Harajuku", area: "West Tokyo", type: "Culture", cost: 0.5, tags: ["Cities"], description: "A forested shrine and the city's most kinetic streets in one natural area." },
    { title: "Mt. Takao", area: "Tokyo west", type: "Nature", cost: 0.5, tags: ["Nature"], description: "A rail escape for a summit walk and a proper break from the city." },
    { title: "Tokyo Marathon", area: "Central Tokyo", type: "Anchor event", cost: 1, tags: ["Cities"], description: "A fixed date that the rest of the week has to bend around." },
    { title: "Food neighbourhood night", area: "Ginza · Shinjuku or Ebisu", type: "Food", cost: 0.5, tags: ["Food"], description: "Leave a night open for the sort of meal that changes the shape of a city." },
  ],
  "hong kong": [
    { title: "Victoria Peak", area: "Central", type: "Viewpoint", cost: 0.5, tags: ["Cities"], description: "The big skyline moment; pair it with Central and a harbour evening." },
    { title: "Star Ferry & harbour", area: "Central ↔ Tsim Sha Tsui", type: "City ritual", cost: 0.5, tags: ["Cities"], description: "A short crossing with maximum sense of place, especially close to dusk." },
    { title: "Dragon's Back", area: "Shek O", type: "Hike", cost: 0.5, tags: ["Nature", "Beach"], description: "A ridge walk finishing naturally near Big Wave Bay or Shek O." },
    { title: "Tai Kwun & old Central", area: "Central", type: "Design + culture", cost: 0.5, tags: ["Cities"], description: "Heritage, galleries and the city's steep streets in one compact stop." },
    { title: "Cantonese food night", area: "Wan Chai or Kowloon", type: "Food", cost: 0.5, tags: ["Food"], description: "Room for one flexible dinner rather than deciding the cuisine in advance." },
  ],
};

/**
 * Fast, relevant next-stop prompts. They deliberately appear only after a
 * destination has been added — an empty route should not pretend to know
 * where someone wants to go.
 */
const NEARBY_SUGGESTIONS: Record<string, string[]> = {
  tokyo: ["Nikko", "Kanazawa", "Takayama", "Kyoto"],
  japan: ["Kyoto", "Kanazawa", "Takayama", "Nikko", "Hiroshima"],
  paris: ["Versailles", "Reims", "Lyon", "Bordeaux"],
  france: ["Lyon", "Bordeaux", "Nice", "Strasbourg"],
  "mexico city": ["Puebla", "Oaxaca", "Tepoztlán", "San Miguel de Allende"],
  mexico: ["Puebla", "Oaxaca", "Mérida", "San Miguel de Allende"],
  bangkok: ["Ayutthaya", "Kanchanaburi", "Chiang Mai", "Koh Samui"],
  thailand: ["Chiang Mai", "Ayutthaya", "Kanchanaburi", "Krabi"],
  london: ["Bath", "Oxford", "Brighton", "Edinburgh"],
  "united kingdom": ["Bath", "Edinburgh", "York", "Brighton"],
  barcelona: ["Girona", "Valencia", "Madrid", "Seville"],
  madrid: ["Toledo", "Seville", "Valencia", "Barcelona"],
  spain: ["Seville", "Granada", "Valencia", "Barcelona"],
  rome: ["Florence", "Naples", "Bologna", "Sorrento"],
  italy: ["Florence", "Bologna", "Naples", "Venice"],
  "hong kong": ["Macau", "Shenzhen", "Guangzhou", "Taipei"],
  china: ["Shanghai", "Chengdu", "Xi'an", "Hong Kong"],
  "guatemala city": ["Antigua Guatemala", "Lake Atitlán", "Flores", "Semuc Champey"],
  guatemala: ["Antigua Guatemala", "Lake Atitlán", "Flores", "Tikal"],
};
const ROUTE_HINT_SUGGESTIONS: Record<string, string[]> = {
  "north-japan": ["Sapporo", "Hakodate", "Sendai"],
  "south-japan": ["Fukuoka", "Nagasaki", "Kagoshima"],
};
const FILTERS = ["All", "Food", "Nature", "Cities", "Beach"];
const ROUTABLE_ENDPOINT_TYPES: PlaceType[] = ["city", "town", "transport_gateway"];
/** Distinct filler days — never repeat one entry verbatim. */
const OPEN_DAYS = [
  { title: "Open day", reason: "Nothing scheduled. Whatever you found yesterday gets today.", items: ["Start wherever you left off", "One walkable area, no cross-city legs", "Leave the evening open"] },
  { title: "Neighbourhood day", reason: "One district, on foot, chosen once you're on the ground.", items: ["Pick a district over breakfast", "Walk it properly rather than ticking sights", "Eat where the queue is local"] },
  { title: "Day trip, if you feel like it", reason: "Held loosely: a short rail hop, or nothing at all.", items: ["Check the weather first", "Keep it under 90 minutes each way", "Be back for an unhurried dinner"] },
  { title: "Slow morning", reason: "A deliberate gap so the trip doesn't turn into a schedule.", items: ["No alarm", "One thing only, in the afternoon", "Restock and reset"] },
  { title: "Repeat day", reason: "Go back to the one place that landed best so far.", items: ["Return somewhere you liked", "See it at a different hour", "Nothing new required"] },
];

/* ------------------------------------------------------------- helpers */

const pad = (n: number) => String(n).padStart(2, "0");
function travelStyleLabels(profile: TravelProfile, language: EasyTLanguage) {
  const labels = language === "es"
    ? {
        pace: { slow: "Ritmo tranquilo", balanced: "Ritmo equilibrado", full: "Días completos" },
        hotelMoves: { few: "Pocas mudanzas de hotel", some: "Algunos cambios de base", open: "Abierto a moverse" },
        budget: { value: "Buena relación calidad-precio", mid: "Gama media", high: "Lo mejor disponible" },
      }
    : {
        pace: { slow: "Slow pace", balanced: "Balanced pace", full: "Full days" },
        hotelMoves: { few: "Fewer hotel moves", some: "A few hotel moves", open: "Open to moving" },
        budget: { value: "Good value", mid: "Mid-range", high: "Best available" },
      };
  return [
    labels.pace[profile.pace],
    ...profile.usualInterests.map((interest) => tripInterestLabels[language][interest]),
    labels.hotelMoves[profile.hotelMoves],
    labels.budget[profile.budget],
  ];
}
const half = (n: number) => String(n).replace(".5", "½");
const durationLabel = (minutes: number | null) => minutes === null ? "Transfer to confirm" : `~${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}h ` : ""}${minutes % 60 ? `${minutes % 60}m` : ""}`.trim();
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fmtLong = (value: string) => {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(d);
};
const placesFor = (stop: Stop, discovered: Record<string, Place[]>): Place[] =>
  discovered[stop.id] ?? CATALOG[stop.name.trim().toLowerCase()] ?? [];

const suggestionsFor = (stop?: Stop) => {
  if (!stop) return [];
  const nearby = NEARBY_SUGGESTIONS[stop.name.trim().toLowerCase()]
    ?? NEARBY_SUGGESTIONS[stop.country.trim().toLowerCase()]
    ?? [];
  return nearby
    .map((name) => canonicalPlaceSuggestionFor(name, [stop.country]))
    .filter((suggestion): suggestion is CanonicalPlaceSuggestion => Boolean(suggestion))
    .filter((suggestion) => suggestion.canonicalPlaceId !== stop.canonicalPlaceId
      && suggestion.name.toLocaleLowerCase() !== stop.name.toLocaleLowerCase());
};

const isOriginMention = (mention: CapturedLocation) => mention.role === "origin" || mention.role === "fixed_start";
const isEndMention = (mention: CapturedLocation) => mention.role === "fixed_end";
const stopMatchesPlace = (stop: Stop, place?: { name: string; canonicalPlaceId?: string }) => Boolean(place && (
  (stop.canonicalPlaceId && place.canonicalPlaceId && stop.canonicalPlaceId === place.canonicalPlaceId)
  || stop.name.toLocaleLowerCase() === place.name.toLocaleLowerCase()
));
const placeTypeLabel = (type: CapturedLocation["placeType"]) => ({
  continent: "Continent", country: "Country", "macro_region": "Macro-region", region: "Region", "sub_region": "Sub-region", island: "Island",
  archipelago: "Archipelago", city: "City", town: "Town", "natural_area": "Natural area", coast: "Coast",
  "mountain_range": "Mountain range", valley: "Valley", "travel_corridor": "Travel corridor", landmark: "Landmark",
  "transport_gateway": "Transport gateway", unknown: "Place to confirm",
}[type]);
const placeStateLabel = (mention: CapturedLocation, hasSelection: boolean) => {
  if (mention.role === "excluded") return "Excluded";
  if (hasSelection) return "Confirmed";
  if (mention.status === "ambiguous") return "Needs confirmation";
  if (mention.status === "unresolved") return "Unresolved";
  if (placeMentionSupportsMultipleSelections(mention)) return "Choose one or more places";
  if (mention.routability === "needs_base_selection" || mention.routability === "planning_area") return "Choose a base";
  if (mention.routability === "anchor_or_poi") return "Kept as an anchor";
  return "Route destination";
};

const placeDisplayName = (mention: CapturedLocation) => mention.canonicalName?.trim() || mention.sourceText.trim();
const planningParentForMention = (mention: CapturedLocation): PlanningParentConstraint => ({
  canonicalPlaceId: mention.canonicalPlaceId,
  canonicalName: placeDisplayName(mention),
  placeType: mention.placeType,
  parentCountries: mention.parentCountries,
  parentRegionId: mention.parentRegionId,
  bounds: mention.bounds,
});
const completedPlanningAreasForBrief = (brief: StructuredTripBrief) => brief.completedPlanningAreaMentionIds
  ?? (brief.placeMentions ?? []).filter((mention) => placeMentionSupportsMultipleSelections(mention)
    && brief.placeSelections?.some((selection) => selection.mentionId === mention.mentionId)).map((mention) => mention.mentionId);
const placeIssueDisplayMessage = (message: string, mention: CapturedLocation) => {
  const sourceText = mention.sourceText.trim();
  if (!sourceText) return message;
  const sourceIndex = message.toLocaleLowerCase().indexOf(sourceText.toLocaleLowerCase());
  if (sourceIndex < 0) return message;
  return `${message.slice(0, sourceIndex)}${placeDisplayName(mention)}${message.slice(sourceIndex + sourceText.length)}`;
};

const placeImageFor = (place: Place, stop: Stop): JourneyImage | null => {
  if (place.image) return { src: place.image, alt: place.title, caption: place.title, sourceUrl: place.sourceUrl ?? place.image };
  const images = mediaImagesFor(stop.name);
  const filename = PLACE_IMAGE_HINTS[place.title.toLowerCase()];
  if (filename) return images.find((image) => image.src.endsWith(`/${filename}`)) ?? null;
  const words = place.title.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  return images.find((image) => words.some((word) => `${image.alt} ${image.caption}`.toLowerCase().includes(word))) ?? images[0] ?? null;
};

/* --------------------------------------------------------- sub-components */

function RadioGroup<T extends string>({ label, help, value, options, onChange }: {
  label: string; help: string; value: T;
  options: { value: T; label: string; note: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className={styles.group}>
      <legend>{label}</legend>
      <p className={styles.groupHelp}>{help}</p>
      <div className={styles.groupGrid} style={{ gridTemplateColumns: `repeat(${options.length},1fr)` }}>
        {options.map((opt) => {
          const on = opt.value === value;
          return (
            /* morrovia-ui-audit-allow-next-line native-control -- Semantic card-radio interaction is owned by this existing Builder RadioGroup rather than the shared push-button control. */
            <button type="button" key={opt.value} role="radio" aria-checked={on}
              className={`${styles.radioCard} ${on ? styles.radioCardOn : ""}`} onClick={() => onChange(opt.value)}>
              <span className={styles.radioDot} />
              <span>
                <strong>{opt.label}</strong>
                <small>{opt.note}</small>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function StopReorderControl({
  stop,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
}: {
  stop: Stop;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (event: ReactDragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const closeOnPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node) || triggerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    return () => document.removeEventListener("pointerdown", closeOnPointerDown);
  }, [open]);

  const closeAndRestoreFocus = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return <div className={styles.reorderControl}>
    <EasyTButton
      ref={triggerRef}
      className={styles.routeGrip}
      icon={GripVertical}
      iconOnly
      size="small"
      variant="quiet"
      draggable={canMoveUp || canMoveDown}
      disabled={!canMoveUp && !canMoveDown}
      aria-label={`Reorder ${stop.name}`}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      onClick={() => {
        if (draggedRef.current) { draggedRef.current = false; return; }
        setOpen((current) => !current);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setOpen(true);
        }
        if (event.key === "Escape") setOpen(false);
      }}
      onDragStart={(event) => { draggedRef.current = true; setOpen(false); onDragStart(event); }}
      onDragEnd={() => { onDragEnd(); window.requestAnimationFrame(() => { draggedRef.current = false; }); }}
    >Reorder {stop.name}</EasyTButton>
    {open ? <div
      ref={menuRef}
      id={menuId}
      className={styles.reorderMenu}
      role="menu"
      aria-label={`Reorder ${stop.name}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); closeAndRestoreFocus(); return; }
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }}
    >
      <EasyTButton role="menuitem" icon={ArrowUp} size="small" variant="quiet" disabled={!canMoveUp} onClick={() => { onMoveUp(); setAnnouncement(`${stop.name} moved up.`); closeAndRestoreFocus(); }}>Move up</EasyTButton>
      <EasyTButton role="menuitem" icon={ArrowDown} size="small" variant="quiet" disabled={!canMoveDown} onClick={() => { onMoveDown(); setAnnouncement(`${stop.name} moved down.`); closeAndRestoreFocus(); }}>Move down</EasyTButton>
    </div> : null}
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
  </div>;
}

/* ------------------------------------------------------------- main */

export default function TripBuilder() {
  const searchParams = useSearchParams();
  const documentParams = new URLSearchParams(searchParams.toString());
  documentParams.delete("step");
  // Recovery address updates describe this same mounted document, not a new editor lifetime.
  documentParams.delete("recover");
  return <TripBuilderDocument key={documentParams.toString()} />;
}

async function reconcileAcceptedBuilderRequest(request: BuilderReconciliationRequest, signal: AbortSignal): Promise<BuilderProjectionResponse> {
  const calculated = reconcileBuilderDependencies(request.trip, request.dispatched).trip;
  const remaining = calculated.brief.cascadeStatus?.routeReconciliation?.residual ?? [];
  const results: BuilderProjectionResponse["results"] = request.dispatched.map(unit => {
    const residual = remaining.find(item => item.kind === unit.kind && item.targetId === unit.targetId);
    return residual && residual.phase !== "pending" ? { ...residual, phase: residual.phase } : { ...unit, phase: "complete" };
  });
  const recommendationProjections: NonNullable<BuilderProjectionResponse["recommendationProjections"]> = [];
  await Promise.all(results.filter(result => result.kind === "recommendation").map(async result => {
    try {
      const target=request.trip.stops.find(stop=>stop.id===result.targetId);
      if(!target||!geographicallyReady(stopGeographicPlace(target)))throw new Error('Location needs confirmation');
      const projection = await resolveBuilderRecommendation(guardTripRoutingGeometry(request.trip), result.targetId, signal);
      recommendationProjections.push(projection);
      result.phase = "complete";
      delete result.reason;
    } catch (error) {
      if (signal.aborted) throw error;
      result.phase = "failed"; result.reason = "unavailable";
    }
  }));
  let legs = calculated.legs.filter(leg => request.dispatched.some(unit => unit.kind === "leg" && unit.targetId === leg.id));
  const qualifiedLegs=legs.filter(leg=>leg.routeMetadata.source!=='unverified-geography');
  for(const result of results)if(result.kind==='leg'&&legs.some(leg=>leg.id===result.targetId&&leg.routeMetadata.source==='unverified-geography')){result.phase='failed';result.reason='unavailable'}
  if (qualifiedLegs.length) {
    try {
      const response = await fetch("/api/journey-transfer-resolution", { method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({legs:qualifiedLegs}), cache: "no-store", signal });
      if (!response.ok) throw new Error("Transfer assessment unavailable");
      const payload = await response.json() as {legs?: TripLeg[]};
      if (!Array.isArray(payload.legs) || payload.legs.length !== qualifiedLegs.length) throw new Error("Invalid transfer assessment");
      legs = legs.map(leg=>payload.legs!.find(result=>result.id===leg.id)??leg);
    } catch (error) {
      if (signal.aborted) throw error;
      for (const result of results) if (result.kind === "leg"&&qualifiedLegs.some(leg=>leg.id===result.targetId)) { result.phase="failed";result.reason="unavailable"; }
    }
  }
  if (signal.aborted) throw new DOMException("Builder input changed", "AbortError");
  return {scope:request.scope,inputKey:request.inputKey,requestId:request.requestId,dispatched:request.dispatched,results,legs,
    routeAssessment:calculated.brief.routeAssessment,recommendationProjections};
}

function TripBuilderDocument() {
  const builderSearchParams = useSearchParams();
  const { data: session, isPending: sessionPending, error: sessionError } = authClient.useSession();
  const authenticatedOwnerId = session?.user?.id ?? null;
  const lastAuthenticatedOwnerIdRef = useRef<string | null>(authenticatedOwnerId);
  if (authenticatedOwnerId) lastAuthenticatedOwnerIdRef.current = authenticatedOwnerId;
  const [rememberedOwnerId, setRememberedOwnerId] = useState<string | null>(null);
  const [browserOffline, setBrowserOffline] = useState(false);
  const [browserContextReady, setBrowserContextReady] = useState(false);
  const sessionUnavailable = Boolean(sessionError
    && (typeof (sessionError as { status?: unknown }).status !== "number"
      || (sessionError as { status?: number }).status !== 401));
  const expiredSessionOwnerId = !sessionPending && !authenticatedOwnerId && !browserOffline
    ? lastAuthenticatedOwnerIdRef.current
    : null;
  const activeBrowserOwnerId = ownerIdForBrowserRecovery({
    authenticatedOwnerId: authenticatedOwnerId ?? expiredSessionOwnerId,
    sessionPending,
    browserOffline: browserOffline || sessionUnavailable,
    rememberedOwnerId,
  });
  const generationStartedRef = useRef(false);
  const generationCompletedRef = useRef(false);
  const localSaveTrackedRef = useRef(false);
  const recoveryHandleRef = useRef<TripRecoveryHandle | null>(null);
  // The mounted session owns canonical rendering, immediate recovery and the single account queue.
  const builderEditSessionRef = useRef<BuilderEditSession | null>(null);
  const lastAcknowledgedCanonicalRef = useRef<EasyTTrip | null>(null);
  const hydratedCanonicalTripRef = useRef<EasyTTrip | null>(null);
  const homeDraftRef = useRef<HomeTripDraft | null>(null);
  const pendingNewTripReceiptRef = useRef<{
    snapshot: HomepageInputSnapshot;
    receipt: ReturnType<typeof homepageReceiptForProjection>;
    draft: HomeTripDraft;
    pending?: PendingIntakeReceipt;
    fromHomepage?: boolean;
  } | null>(null);
  const receiptAcknowledgementRef = useRef<Promise<boolean> | null>(null);
  const pendingInterpretationRef = useRef<PendingIntakeReceipt | null>(null);
  const planningAttemptIdRef = useRef<string | null>(null);
  const planningModeRef = useRef<"stops" | "describe">("stops");
  const handoffOccurrenceMentionIdsRef = useRef<Record<string, string>>({});
  const activeProjectionTokenRef = useRef<string | null>(null);
  const handoffLookupSessionRef = useRef<{
    controller: AbortController;
    statuses: Map<string, "pending" | "resolved" | "needs-confirmation" | "failed">;
    handled: Set<string>;
    retry?: (mentionId: string) => void;
    replayPending?: () => void;
  } | null>(null);
  const [pendingInterpretation, setPendingInterpretation] = useState<{ receipt: PendingIntakeReceipt; fromHomepage: boolean } | null>(null);
  const [pendingInterpretationRetry, setPendingInterpretationRetry] = useState(0);
  const [pendingFailureKind, setPendingFailureKind] = useState<"domain" | "network" | null>(null);
  const captureRequestGateRef = useRef<ReturnType<typeof createLatestJourneyCaptureRequestGate> | null>(null);
  if (!captureRequestGateRef.current) captureRequestGateRef.current = createLatestJourneyCaptureRequestGate();
  const hydratedOwnerScopeRef = useRef<string | null | undefined>(undefined);
  const activeBrowserOwnerIdRef = useRef(activeBrowserOwnerId);
  activeBrowserOwnerIdRef.current = activeBrowserOwnerId;
  const [builderSeed, setBuilderSeed] = useState<Pick<BuilderEditSessionOptions, "initialTrip" | "initialRecovery" | "initialCanonicalTrip" | "allowRecoverySync"> | null>(null);
  const builderSeedPendingRef = useRef(false);
  const mountedBuilder = useBuilderEditSession(builderSeed && builderSeed.initialTrip.id && hydratedOwnerScopeRef.current === activeBrowserOwnerId ? {
    ...builderSeed,
    getOwnerId: () => activeBrowserOwnerIdRef.current,
    readDraft: (trip, owner) => readBuilderInputDraft(window.localStorage, trip, owner),
    writeDraft: (trip, draft, owner) => writeBuilderInputDraft(window.localStorage, trip, draft, owner),
    saveRecovery: (trip, options) => {
      const result=saveTripRecovery(trip,options);
      if(result.stored){
        const durable=durableBuilderRecoveryUrl(window.location.href,trip.id);
        const url=durable??new URL(window.location.href);
        if(trip.ownerId && url.searchParams.get("trip")===trip.id)url.searchParams.set("recover","1");
        if(durable || url.href!==window.location.href)window.history.replaceState(window.history.state,"",url);
      }
      return result;
    },
    acknowledgeRecovery: (reviewed, canonical, handle) => {
      const result=acknowledgeTripBuildSave(reviewed,canonical,handle);
      if(result.outcome==="acknowledged" && !loadTripRecovery(handle.tripId,handle.ownerId)){
        const url=new URL(window.location.href);if(url.searchParams.get("trip")===handle.tripId){url.searchParams.delete("recover");window.history.replaceState(window.history.state,"",url);}
      }
      return result;
    },
    markRecoveryState: markTripRecoveryState,
    persistAccount: saveTripRecoveryToEasyT,
    reconcile: reconcileAcceptedBuilderRequest,
    now: () => new Date().toISOString(),
    schedule: (callback, milliseconds) => { const timer = window.setTimeout(callback, milliseconds); return () => window.clearTimeout(timer); },
  } : null, JSON.stringify([builderSeed?.initialTrip.id, activeBrowserOwnerId]));
  builderEditSessionRef.current = mountedBuilder?.session ?? null;
  const canonicalBuilder = mountedBuilder?.snapshot.trip;
  useEffect(()=>{
    if(!mountedBuilder)return;
    recoveryHandleRef.current=mountedBuilder.snapshot.recovery;
    hydratedCanonicalTripRef.current=mountedBuilder.snapshot.trip;
    if(mountedBuilder.snapshot.canonicalSaveState==="cloud")lastAcknowledgedCanonicalRef.current=mountedBuilder.snapshot.trip;
    handoffLookupSessionRef.current?.replayPending?.();
  },[mountedBuilder?.snapshot]);
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const copy = easytCopy[language].builder;
  const ui = language === "es" ? {
    previousMonth: "Mes anterior", nextMonth: "Mes siguiente", draft: "Borrador · editable", editBrief: "Editar resumen",
    dayByDay: "Día a día", source: "Fuente ↗", previousDay: "← Día anterior", nextDay: "Siguiente día →",
    savingChanges: "Guardando cambios…", savedDevice: "Guardado en este dispositivo", exploreMap: "Explora el mapa primero y guárdalo en una cuenta cuando estés listo.", openMap: "Abrir mapa →",
    addOrigin: "Añade tu ciudad o aeropuerto de salida.", addStop: "Añade al menos una parada para continuar", typePlace: "Escribe primero una ciudad, región o lugar.", checking: "Comprobando este lugar…", unavailable: "No pudimos comprobar este lugar ahora. Inténtalo de nuevo.",
    verifyOrigin: "No pudimos verificar ese punto de partida.", originUnavailable: "No pudimos comprobar ese punto de partida ahora.", startDate: "Fecha de inicio", endDate: "Fecha de fin", pickDate: "Elige una fecha", typeIt: "O escríbela",
    day: "día", days: "días", split: "Elige exactamente cómo repartir tu tiempo entre destinos en el siguiente paso.", addStops: "Añade paradas y se repartirán entre ellas.", selected: "seleccionados", finding: "Buscando lugares y actividades reales cerca de", noSuggestions: "Aún no hay sugerencias fiables. Comprueba la ubicación o inténtalo de nuevo.",
    yourTime: "TU TIEMPO", shapeDays: "Organiza tus días", allocation: "Hemos sugerido una distribución inicial según tus lugares. Mueve un control y Morrovia reajustará el resto.", total: "días en total", suggested: "sugeridos", budget: "Presupuesto", budgetHelp: "Se usa para elegir dónde dormir y comer durante la investigación.", value: "Buena relación calidad-precio", valueNote: "Cómodo, sin excesos.", mid: "Gama media", midNote: "Algunos caprichos.", high: "Sin límite", highNote: "Lo mejor disponible.", route: "RUTA HASTA AHORA", departure: "Salida", routeEmpty: "Añade una parada y la ruta aparecerá aquí.", daysBudget: "PRESUPUESTO DE DÍAS", full: "COMPLETO", room: "DÍAS DISPONIBLES", overBy: "EXCESO DE", available: "días disponibles", committed: "comprometidos", open: "libres", overHint: "Hay más lugares seleccionados de los que permiten las fechas. Quita un lugar, elimina una parada o añade días.", selectedPlaces: "LUGARES SELECCIONADOS", nothingSelected: "Aún no hay nada seleccionado. El paso 03 concreta el viaje.", removePlace: "Quitar lugar", placesSelected: "lugares seleccionados", daysTotal: "días en total"
  } : {
    previousMonth: "Previous month", nextMonth: "Next month", draft: "Draft · editable", editBrief: "Edit brief", dayByDay: "Day by day", source: "Source ↗", previousDay: "← Previous day", nextDay: "Next day →", savingChanges: "Saving changes…", savedDevice: "Saved on this device", exploreMap: "Explore the map first, then save it to an account when you are ready.", openMap: "Open map view →", addOrigin: "Add the city or airport you're leaving from.", addStop: "Add at least one stop to continue", typePlace: "Type a city, region or landmark first.", checking: "Checking this place…", unavailable: "We couldn't check that place just now. Please try again.", verifyOrigin: "We couldn't verify that starting point.", originUnavailable: "We couldn't check that starting point just now.", startDate: "Start date", endDate: "End date", pickDate: "Pick a date", typeIt: "Or type it", day: "day", days: "days", split: "Choose exactly how your time is split between destinations in the next step.", addStops: "Add stops and this splits across them.", selected: "selected", finding: "Finding real places, landmarks and activities around", noSuggestions: "No reliable suggestions loaded yet. Check the location or try again shortly.", yourTime: "YOUR TIME", shapeDays: "Shape the days", allocation: "We've suggested a starting split from your selected places. Move a slider and Morrovia rebalances the rest.", total: "days total", suggested: "suggested", budget: "Budget band", budgetHelp: "Used to pick where to sleep and eat during research.", value: "Good value", valueNote: "Comfortable, not precious.", mid: "Mid-range", midNote: "Some splurges.", high: "No ceiling", highNote: "Best available.", route: "ROUTE SO FAR", departure: "Departure", routeEmpty: "Add a stop and the route builds here as you go.", daysBudget: "DAYS BUDGET", full: "FULL", room: "ROOM LEFT", overBy: "OVER BY", available: "days available", committed: "committed", open: "open", overHint: "More is selected than the dates allow. Remove a place, drop a stop, or add days.", selectedPlaces: "SELECTED PLACES", nothingSelected: "Nothing selected yet. Step 03 is where the trip gets specific.", removePlace: "Remove place", placesSelected: "places selected", daysTotal: "days total"
  };
  const [initialTripId, setTripId] = useState(() => `trip-${crypto.randomUUID()}`);
  const tripId = canonicalBuilder ? (canonicalBuilder.id) : initialTripId;
  const [initialTripOwnerId, setTripOwnerId] = useState<string | null>(null);
  const tripOwnerId = canonicalBuilder ? (canonicalBuilder.ownerId) : initialTripOwnerId;
  const [initialTripStatus, setTripStatus] = useState<TripStatus>("draft");
  const tripStatus = canonicalBuilder ? (canonicalBuilder.status) : initialTripStatus;
  const [initialCreatedAt, setCreatedAt] = useState(() => new Date().toISOString());
  const createdAt = canonicalBuilder ? (canonicalBuilder.createdAt) : initialCreatedAt;
  const [initialTripUpdatedAt, setTripUpdatedAt] = useState<string | null>(null);
  const tripUpdatedAt = canonicalBuilder ? (canonicalBuilder.updatedAt) : initialTripUpdatedAt;
  const [hydrated, setHydrated] = useState(false);
  const [entryKind, setEntryKind] = useState<NewTripEntryState["kind"]>("loading");
  const [resumedQuerylessDraft, setResumedQuerylessDraft] = useState(false);
  const [tripUnavailable, setTripUnavailable] = useState(false);
  const [initialSaveState, setSaveState] = useState<"device-saving" | "local" | "cloud-saving" | "cloud" | "error">("device-saving");
  const [initialCloudSaveError, setCloudSaveError] = useState("");
  const saveState = mountedBuilder?.snapshot.saveState ?? initialSaveState;
  const cloudSaveError = mountedBuilder?.snapshot.error?.message ?? initialCloudSaveError;
  const [cloudConflictTrip, setCloudConflictTrip] = useState<ReturnType<typeof loadActiveTrip>>(null);
  const [initialCloudAuthInterrupted, setCloudAuthInterrupted] = useState(false);
  const cloudAuthInterrupted=mountedBuilder?mountedBuilder.snapshot.error?.category==="auth":initialCloudAuthInterrupted;
  const [deviceStorageBlocked, setDeviceStorageBlocked] = useState(false);
  const [deviceRecoveryBlocked, setDeviceRecoveryBlocked] = useState(false);
  const legacyFocusRef = useRef<"summary" | "timing" | null>(null);
  const legacyFocusScheduledRef = useRef(false);
  const requestedPlaceIntentRef = useRef(builderSearchParams.get("placeIntent"));
  const [showTripDetails, setShowTripDetails] = useState(false);
  const [detailsCommitBusy, setDetailsCommitBusy] = useState(false);
  const [detailsCommitError, setDetailsCommitError] = useState("");
  const [showStopEditor, setShowStopEditor] = useState(false);
  const [summaryFocus, setSummaryFocus] = useState<"origin" | "stops" | "dates" | "constraints" | null>(null);
  const [generated, setGenerated] = useState(false);
  const [editingRouteStopId, setEditingRouteStopId] = useState<string | null>(null);
  const [routeNightDraft, setRouteNightDraft] = useState<Record<string, number> | null>(null);

  const today = useMemo(() => iso(new Date()), []);
  const oneWeekLater = useMemo(() => { const date = new Date(); date.setDate(date.getDate() + 6); return iso(date); }, []);
  const [initialJourneyOrigin, setJourneyOrigin] = useState<JourneyEndpointPlace>({ name: "" });
  const journeyOrigin = canonicalBuilder ? (canonicalBuilder.brief.intent.route.origin ?? {name:""}) : initialJourneyOrigin;
  const origin = journeyOrigin.name;
  const originCoordinates = journeyOrigin.coordinates;
  const originCanonicalPlaceId = journeyOrigin.canonicalPlaceId;
  const originCountry = journeyOrigin.country;
  const originProviderId = journeyOrigin.providerId;
  const [initialTripBrief, setTripBrief] = useState("");
  const tripBrief = canonicalBuilder ? (canonicalBuilder.brief.mustDo) : initialTripBrief;
  const [baseSearchInputs, setBaseSearchInputs] = useState<Record<string, string>>({});
  const [baseSearchErrors, setBaseSearchErrors] = useState<Record<string, string>>({});
  const [outsideDiscoveryChoice, setOutsideDiscoveryChoice] = useState<{ mentionId: string; suggestion: CanonicalPlaceSuggestion } | null>(null);
  const [pendingDiscoveryBase, setPendingDiscoveryBase] = useState<{ mentionId: string; area: CanonicalPlaceSuggestion } | null>(null);
  const [searchedAreaBases, setSearchedAreaBases] = useState<NearbyBaseDiscoveryState | null>(null);
  const [originPlanningMentionId, setOriginPlanningMentionId] = useState<string | null>(null);
  const [transientPlanningMentionId, setTransientPlanningMentionId] = useState<string | null>(null);
  const originResolutionVersionRef = useRef(0);
  const replaceJourneyOrigin = (place: JourneyEndpointPlace) => {
    originResolutionVersionRef.current += 1;
    setJourneyOrigin(canonicalJourneyEndpointPlace(place));
  };
  const [originTouched, setOriginTouched] = useState(false);
  const [originError, setOriginError] = useState("");
  const [initialJourneyEnd, setJourneyEnd] = useState<JourneyEndSelection>({ mode: "same_as_start" });
  const journeyEnd = canonicalBuilder ? (canonicalBuilder.brief.intent.route.journeyEnd) : initialJourneyEnd;
  const [journeyEndInput, setJourneyEndInput] = useState("");
  const [journeyEndTouched, setJourneyEndTouched] = useState(false);
  const [journeyEndError, setJourneyEndError] = useState("");
  const [journeyEndResolutionAttempted, setJourneyEndResolutionAttempted] = useState(false);
  const [startRevealSuggestionsKey, setStartRevealSuggestionsKey] = useState(0);
  const [endRevealSuggestionsKey, setEndRevealSuggestionsKey] = useState(0);
  const journeyEndResolutionVersionRef = useRef(0);
  const originBeforePlanningClarificationRef = useRef<{
    name: string;
    coordinates?: [number, number];
    canonicalPlaceId?: string;
    country?: string;
    providerId?: string;
    touched: boolean;
  } | null>(null);
  const [initialStops, setStops] = useState<Stop[]>([]);
  const stops = canonicalBuilder ? (canonicalBuilder.stops.map(stop => ({id:stop.id,name:stop.name,country:stop.country,canonicalPlaceId:stop.canonicalPlaceId,countryCode:stop.countryCode,region:stop.region,providerId:stop.providerId,geographicBinding:stop.geographicBinding,coordinates:stop.longitude !== null && stop.latitude !== null ? [stop.longitude,stop.latitude] as [number,number] : undefined}))) : initialStops;
  const hasRouteSkeleton = hasUsefulRouteSkeleton(stops);
  const [routeHints, setRouteHints] = useState<string[]>([]);
  const [sourceRouteKey, setSourceRouteKey] = useState<string | undefined>();
  const [curatedRoute, setCuratedRoute] = useState<CuratedRouteKnowledge | undefined>();
  const [initialStopInput, setStopInput] = useState("");
  const stopInput=mountedBuilder?.snapshot.draft.fields.find(f=>f.binding.kind==="destination-add"&&f.status==="editable")?.raw??initialStopInput;
  const [topAddOpen,setTopAddOpen]=useState(false);
  const topAddVisible=topAddOpen||Boolean(mountedBuilder?.snapshot.draft.fields.some(f=>f.binding.kind==="destination-add"&&f.raw));
  const [pendingTopType,setPendingTopType]=useState<{type:"return_to_start"|"one_way";revision:number;name:string}|null>(null);
  const savedFinishRequestRef=useRef<AbortController|null>(null);
  const [savedFinishReview,setSavedFinishReview]=useState<{ownerId:string|null;tripId:string;targetId:string;endKey:string;name:string;choices:LocationChoice[];status:"loading"|"ready"|"unavailable"}|null>(null);
  const savedTargetPlace=(trip:CanonicalEasyTTrip,targetId:string)=>targetId==='origin'?trip.brief.intent.route.origin:
    targetId==='end'?(trip.brief.intent.route.journeyEnd.mode==='explicit'?trip.brief.intent.route.journeyEnd.place:null):
    trip.stops.find(stop=>stop.id===targetId)?stopGeographicPlace(trip.stops.find(stop=>stop.id===targetId)!):null;
  const savedTargetKey=(place:JourneyEndpointPlace)=>authoredContentKey([geographicInputKey(place),place.geographicBinding??null]);
  const savedFinishIsCurrent=(review:NonNullable<typeof savedFinishReview>)=>{
    const snapshot=builderEditSessionRef.current?.getSnapshot();
    return snapshot && snapshot.browserOwnerId===review.ownerId && activeBrowserOwnerIdRef.current===review.ownerId
      && snapshot.trip.id===review.tripId && savedTargetPlace(snapshot.trip,review.targetId)
      && savedTargetKey(savedTargetPlace(snapshot.trip,review.targetId)!)===review.endKey ? snapshot : null;
  };
  const dismissSavedFinish=()=>{savedFinishRequestRef.current?.abort();savedFinishRequestRef.current=null;setSavedFinishReview(null)};
  const confirmSavedLocation=async(targetId:string)=>{
    const snapshot=builderEditSessionRef.current?.getSnapshot();
    const place=snapshot?savedTargetPlace(snapshot.trip,targetId):null;
    const role=targetId==='origin'||targetId==='end'?'endpoint':'stop';
    if(!snapshot || !place || geographicallyReady(place,role))return;
    const area=role==='stop'?snapshot.trip.brief.intent.route.destinations.find(intent=>intent.kind==='planning_area'
      && intent.stopIds.length===1&&intent.stopIds[0]===targetId
      && !snapshot.trip.brief.structuredBrief?.placeSelections?.some(selection=>selection.mentionId===intent.id&&selection.kind==='base')):undefined;
    if(area){openClarificationSession(area.id);return;}
    savedFinishRequestRef.current?.abort();
    const controller=new AbortController();savedFinishRequestRef.current=controller;
    const review={ownerId:snapshot.browserOwnerId,tripId:snapshot.trip.id,targetId,endKey:savedTargetKey(place),name:place.name,choices:[] as LocationChoice[],status:"loading" as const};
    setSavedFinishReview(review);
    try {
      const params=new URLSearchParams({place:place.name,candidates:"1"});if(place.country)params.set("country",place.country);
      const response=await withProviderTimeout({label:"Saved location lookup",timeoutMs:8_000,signal:controller.signal,request:signal=>fetch(`/api/journey-geocode?${params}`,{signal})});
      if(!response.ok)throw new Error("Saved finish lookup unavailable");
      const payload=await response.json() as {candidates?:LocationChoice[]};
      const choices=(payload.candidates??[]).filter(choice=>geographicCandidateMatches(place,choice,role));
      if(controller.signal.aborted || savedFinishRequestRef.current!==controller || !savedFinishIsCurrent(review))return;
      setSavedFinishReview({...review,choices,status:choices.length?"ready":"unavailable"});
    }catch {
      if(!controller.signal.aborted && savedFinishRequestRef.current===controller && savedFinishIsCurrent(review))setSavedFinishReview({...review,status:"unavailable"});
    }
  };
  const confirmSavedFinish=()=>confirmSavedLocation('end');
  useEffect(()=>()=>{savedFinishRequestRef.current?.abort()},[]);
  useEffect(()=>{if(savedFinishReview&&!savedFinishIsCurrent(savedFinishReview))dismissSavedFinish()},[savedFinishReview,mountedBuilder?.snapshot.trip,mountedBuilder?.snapshot.browserOwnerId,activeBrowserOwnerId]);
  const [pendingTopRemoval,setPendingTopRemoval]=useState<{intentId:string;revision:number;name:string;stays:string[];nights:number}|null>(null);
  const [stopSearchReadyKey, setStopSearchReadyKey] = useState(0);
  const [stopError, setStopError] = useState("");
  const [stopChecking, setStopChecking] = useState(false);
  const [countryAddReview, setCountryAddReview] = useState<{suggestion?:CanonicalPlaceSuggestion;resolved:LocationChoice;name:string;country:string;raw:string;revision:number;tripId:string;ownerId:string|null}|null>(null);
  const countryAddReviewRef=useRef<typeof countryAddReview>(null);
  const addPlaceLookupSequenceRef=useRef(0);
  const cancelCountryAddReview=()=>{countryAddReviewRef.current=null;setCountryAddReview(null);addPlaceLookupSequenceRef.current++;setStopChecking(false)};
  useEffect(()=>{
    const review=countryAddReviewRef.current,snapshot=mountedBuilder?.snapshot;
    if(review&&(!snapshot||snapshot.trip.id!==review.tripId||snapshot.browserOwnerId!==review.ownerId||snapshot.inputRevision!==review.revision)){
      countryAddReviewRef.current=null;setCountryAddReview(null);addPlaceLookupSequenceRef.current++;
    }
  },[mountedBuilder?.snapshot.trip.id,mountedBuilder?.snapshot.browserOwnerId,mountedBuilder?.snapshot.inputRevision]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const [routePreviewStopIds, setRoutePreviewStopIds] = useState<readonly string[] | null>(null);
  const [routeCheckProposalStopIds, setRouteCheckProposalStopIds] = useState<readonly string[] | null>(null);
  const [optimizationResult,setOptimizationResult]=useState<BuilderOptimizationResult|null>(null);
  const [optimizationChecking,setOptimizationChecking]=useState(false);
  const [optimizationError,setOptimizationError]=useState("");
  const optimizationGateRef=useRef<ReturnType<typeof createLatestJourneyCaptureRequestGate>|null>(null);
  if(!optimizationGateRef.current)optimizationGateRef.current=createLatestJourneyCaptureRequestGate();
  const optimizationProposal=optimizationResult?.kind==="proposal"?optimizationResult.proposal:null;
  const optimizationStale=Boolean(optimizationProposal&&(!mountedBuilder||!acceptBuilderOptimization(mountedBuilder.snapshot.trip,optimizationProposal,{ownerId:mountedBuilder.snapshot.browserOwnerId,tripId:mountedBuilder.snapshot.trip.id,inputRevision:mountedBuilder.snapshot.inputRevision}).ok));
  useEffect(()=>()=>optimizationGateRef.current?.cancel(),[]);
  useEffect(()=>{optimizationGateRef.current?.cancel();setOptimizationChecking(false);setOptimizationResult(result=>result?.kind==="proposal"?result:null);},[mountedBuilder?.session,mountedBuilder?.snapshot.inputRevision,mountedBuilder?.snapshot.browserOwnerId]);
  useEffect(()=>{setOptimizationResult(null);setOptimizationError("");},[mountedBuilder?.session]);
  const [selectedRouteStopId, setSelectedRouteStopId] = useState<string | null>(null);
  const [keptRouteKey, setKeptRouteKey] = useState<string | null>(null);
  useEffect(() => {
    if (selectedRouteStopId && stops.some((stop) => stop.id === selectedRouteStopId)) return;
    setSelectedRouteStopId(stops[0]?.id ?? null);
  }, [selectedRouteStopId, stops]);
  const [locationChoices, setLocationChoices] = useState<Array<{ mention: CapturedLocation; choices: LocationChoice[] }>>([]);
  const [resolvingLocations, setResolvingLocations] = useState(false);
  const [handoffResolutionStatuses, setHandoffResolutionStatuses] = useState<Record<string, "pending" | "resolved" | "needs-confirmation" | "failed">>({});
  const [intakeMentions, setIntakeMentions] = useState<CapturedLocation[]>([]);
  const [initialPlaceSelections, setPlaceSelections] = useState<PlaceSelection[]>([]);
  const placeSelections = canonicalBuilder ? (canonicalBuilder.brief.structuredBrief?.placeSelections ?? []) : initialPlaceSelections;
  const [planningSuggestions, setPlanningSuggestions] = useState<GuidedPlanningAreaSuggestion[]>([]);
  const [countryEnrichment, setCountryEnrichment] = useState<{ key: string; status: "loading" | "ready" | "unavailable"; suggestions: GuidedPlanningAreaSuggestion[] }>({ key: "", status: "ready", suggestions: [] });
  const countryEnrichmentRequestsRef = useRef(new Map<string, Promise<GuidedPlanningAreaSuggestion[]>>());
  const [initialCompletedPlanningAreaMentionIds, setCompletedPlanningAreaMentionIds] = useState<string[]>([]);
  const completedPlanningAreaMentionIds = canonicalBuilder ? (canonicalBuilder.brief.structuredBrief?.completedPlanningAreaMentionIds ?? []) : initialCompletedPlanningAreaMentionIds;
  const [initialRemovedPlaceMentionIds, setRemovedPlaceMentionIds] = useState<string[]>([]);
  const removedPlaceMentionIds = canonicalBuilder ? (canonicalBuilder.brief.structuredBrief?.removedPlaceMentionIds ?? []) : initialRemovedPlaceMentionIds;
  const removedPlaceMentionIdsRef = useRef(removedPlaceMentionIds);
  removedPlaceMentionIdsRef.current = removedPlaceMentionIds;
  const placeSelectionsRef = useRef(placeSelections);
  placeSelectionsRef.current = placeSelections;
  const [resolvingPlaceMentionId, setResolvingPlaceMentionId] = useState<string | null>(null);
  const [applyingAreaShapeId, setApplyingAreaShapeId] = useState<string | null>(null);
  const [clarificationOpen, setClarificationOpen] = useState(false);
  const [clarificationSessionIds, setClarificationSessionIds] = useState<string[]>([]);
  const [clarificationIndex, setClarificationIndex] = useState(0);
  const [clarificationAutoOpened, setClarificationAutoOpened] = useState(false);
  const [clarificationDismissed, setClarificationDismissed] = useState(false);
  const [discoveryCommitting, setDiscoveryCommitting] = useState(false);
  const [buildAttentionReviewOpen, setBuildAttentionReviewOpen] = useState(false);
  const [nearbyBaseDiscovery, setNearbyBaseDiscovery] = useState<NearbyBaseDiscoveryState | null>(null);
  const [nearbyBaseRetryNonce, setNearbyBaseRetryNonce] = useState(0);
  const [expandedNearbyBaseMentionIds, setExpandedNearbyBaseMentionIds] = useState<string[]>([]);
  const [productTourOpen, setProductTourOpen] = useState(false);
  const clarificationResumeRef = useRef<HTMLButtonElement>(null);
  const discoveryCommitRef = useRef(false);
  const restoreClarificationResumeFocusRef = useRef(false);
  const clarificationScopeRef = useRef<string | null | undefined>(undefined);
  const originErrorId = useId();
  const stopErrorId = useId();
  const stopInputId = useId();
  const [initialTripIntent, setTripIntent] = useState<TripIntent>(() => defaultTripIntent());
  const tripIntent = canonicalBuilder ? (canonicalBuilder.brief.intent) : initialTripIntent;
  const [initialCapturedStructuredBrief, setCapturedStructuredBrief] = useState<StructuredTripBrief>(() => extractStructuredTripBrief(""));
  const capturedStructuredBrief = canonicalBuilder ? (canonicalBuilder.brief.structuredBrief ?? extractStructuredTripBrief("")) : initialCapturedStructuredBrief;
  const [travellersManuallyEdited, setTravellersManuallyEdited] = useState(false);
  const [paceManuallyEdited, setPaceManuallyEdited] = useState(false);
  const [transportManuallyEdited, setTransportManuallyEdited] = useState(false);
  const [interestsManuallyEdited, setInterestsManuallyEdited] = useState(false);
  const [fixedCommitmentLabel, setFixedCommitmentLabel] = useState("");
  const [fixedCommitmentDate, setFixedCommitmentDate] = useState("");
  const [initialScheduleLocks, setScheduleLocks] = useState<TripScheduleLocks>({ stopIds: [], arrivalDates: {} });
  const scheduleLocks = canonicalBuilder ? (canonicalBuilder.brief.scheduleLocks ?? {stopIds:[],arrivalDates:{}}) : initialScheduleLocks;
  const [initialDecisionSelections, setDecisionSelections] = useState<TripDecisionSelections>({ transportByLeg: {} });
  const decisionSelections = canonicalBuilder ? (canonicalBuilder.brief.decisionSelections ?? {transportByLeg:{}}) : initialDecisionSelections;
  const [lastStructuralChange, setLastStructuralChange] = useState<StructuralSnapshot | null>(null);
  const [structuralNoticeVersion, setStructuralNoticeVersion] = useState(0);
  const builderActionRef = useRef<HTMLDivElement | null>(null);

  const [initialStartDate, setStartDate] = useState(today);
  const startDate = canonicalBuilder ? (canonicalBuilder.startDate) : initialStartDate;
  const [initialEndDate, setEndDate] = useState(oneWeekLater);
  const endDate = canonicalBuilder ? (canonicalBuilder.endDate) : initialEndDate;
  const [datesManuallyEdited, setDatesManuallyEdited] = useState(false);
  const [initialEndDateStillSuggested, setEndDateStillSuggested] = useState(false);
  const endDateStillSuggested = canonicalBuilder ? (canonicalBuilder.brief.endDateIsSuggestion === true) : initialEndDateStillSuggested;

  const [filter, setFilter] = useState("All");
  const [initialPicks, setPicks] = useState<Record<string, string[]>>({});
  const picks = canonicalBuilder ? (canonicalBuilder.brief.selectedPlaces) : initialPicks;
  const [initialDayAllocations, setDayAllocations] = useState<Record<string, number>>({});
  const dayAllocations = canonicalBuilder ? (canonicalBuilder.brief.nightAllocations ?? {}) : initialDayAllocations;
  const [initialManualNightStopIds, setManualNightStopIds] = useState<string[]>([]);
  const manualNightStopIds = canonicalBuilder ? (canonicalBuilder.brief.manualNightStopIds ?? []) : initialManualNightStopIds;
  const [nightEditFeedback, setNightEditFeedback] = useState<NightEditFeedback | null>(null);
  const [discoveredPlaces, setDiscoveredPlaces] = useState<Record<string, Place[]>>({});
  const [discovering, setDiscovering] = useState<Record<string, boolean>>({});

  const [initialBudget, setBudget] = useState<"value" | "mid" | "high">("value");
  const budget = canonicalBuilder ? (canonicalBuilder.brief.budgetBand) : initialBudget;
  const [initialBudgetPreference, setBudgetPreference] = useState<TripBudgetPreference | undefined>();
  const budgetPreference = canonicalBuilder ? (canonicalBuilder.brief.budgetPreference) : initialBudgetPreference;
  const [travelProfile, setTravelProfile] = useState<TravelProfile>(defaultTravelProfile);
  const [hasSavedTravelProfile, setHasSavedTravelProfile] = useState(false);
  const currentPresentationRef = useRef({ language, travelProfile, hasSavedTravelProfile });
  currentPresentationRef.current = { language, travelProfile, hasSavedTravelProfile };
  const [showBudgetOverride, setShowBudgetOverride] = useState(false);
  const [timingWarningOpen, setTimingWarningOpen] = useState(false);
  const [hasPromptContext, setHasPromptContext] = useState(false);
  const [arrivedFromHomepage, setArrivedFromHomepage] = useState(false);
  const [applyingTripBrief, setApplyingTripBrief] = useState(false);
  const [tripBriefCaptureError, setTripBriefCaptureError] = useState("");
  const [buildRequested, setBuildRequested] = useState(false);
  const [openingTrip, setOpeningTrip] = useState(false);
  const [pendingStopRemoval, setPendingStopRemoval] = useState<{ id: string; name: string; plannedDays: number; savedIdeas: number; nights: number; hasStay: boolean; hasBookings: boolean;
    binding?: { ownerId: string | null; tripId: string; intentId: string; canonicalStopId: string; placeKey: string }; error?: string } | null>(null);
  const [stopRemovalBlocked, setStopRemovalBlocked] = useState<{ id: string; name: string } | null>(null);

  const timingWarningRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);

  useEffect(() => {
    const updateTourState = (event: Event) => setProductTourOpen(Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open));
    window.addEventListener(PRODUCT_TOUR_STATE_EVENT, updateTourState);
    return () => window.removeEventListener(PRODUCT_TOUR_STATE_EVENT, updateTourState);
  }, []);

  useEffect(() => () => captureRequestGateRef.current?.cancel(), []);
  useEffect(() => () => handoffLookupSessionRef.current?.controller.abort(), []);

  useEffect(() => {
    const updateRememberedOwner = () => setRememberedOwnerId(loadRememberedOwner());
    const updateConnectivity = () => setBrowserOffline(window.navigator.onLine === false);
    const onStorage = (event: StorageEvent) => {
      if (event.key === EASYT_LAST_OWNER_KEY) updateRememberedOwner();
    };
    updateRememberedOwner();
    updateConnectivity();
    setBrowserContextReady(true);
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);
    window.addEventListener(EASYT_LAST_OWNER_CHANGE_EVENT, updateRememberedOwner);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("online", updateConnectivity);
      window.removeEventListener("offline", updateConnectivity);
      window.removeEventListener(EASYT_LAST_OWNER_CHANGE_EVENT, updateRememberedOwner);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!authenticatedOwnerId) return;
    rememberLastOwner(authenticatedOwnerId);
    setRememberedOwnerId(authenticatedOwnerId);
  }, [authenticatedOwnerId]);

  useEffect(() => {
    if (expiredSessionOwnerId) setCloudAuthInterrupted(true);
  }, [expiredSessionOwnerId]);

  useEffect(() => {
    if (session !== null || sessionPending || sessionError || browserOffline || expiredSessionOwnerId) return;
    forgetRememberedOwner();
    setRememberedOwnerId(null);
  }, [browserOffline, expiredSessionOwnerId, session, sessionError, sessionPending]);

  const applyNewTripIntake = (draft: HomeTripDraft, isCurrent: () => boolean, fromHomepage = false) => {
    planningAttemptIdRef.current = draft.homepage?.receipt?.handoffId ?? draft.handoffId ?? null;
    planningModeRef.current = draft.homepage?.mode ?? "stops";
    if (fromHomepage) {
      homeDraftRef.current = draft;
      setArrivedFromHomepage(true);
    }
    setHasPromptContext(true);
    setSourceRouteKey(draft.sourceRouteKey);
    setCuratedRoute(draft.curatedRoute);
    if (draft.decisionSelections) setDecisionSelections(draft.decisionSelections);
    if (draft.origin) replaceJourneyOrigin(draft.routeIntent?.origin ?? {
      name: draft.origin,
      coordinates: draft.originCoordinates,
      canonicalPlaceId: draft.originCanonicalPlaceId,
      country: draft.originCountry,
      providerId: draft.originProviderId,
    });
    const capturedJourneyEnd = normalizeJourneyEnd(draft.journeyEnd
      ?? journeyEndFromCapturedIntent(draft.brief ?? "", draft.locationMentions ?? draft.structuredBrief?.placeMentions ?? []));
    setJourneyEnd(capturedJourneyEnd);
    setJourneyEndInput(capturedJourneyEnd.mode === "explicit" ? capturedJourneyEnd.place.name : "");
    // `destination` is retained for drafts created before prompt-first
    // routing. New homepage drafts carry the complete verified route.
    const draftStops = draft.destinations?.length ? draft.destinations : draft.destination ? [draft.destination] : [];
    if (draft.routeHints) setRouteHints(draft.routeHints);
    if (draft.nightAllocations) setDayAllocations(draft.nightAllocations);
    const intakeDates = homepageBuilderDateRange(draft, defaultTripIntent().timing.durationDays);
    if (draft.startDate) setStartDate(draft.startDate);
    if (intakeDates.endDate) setEndDate(intakeDates.endDate);
    setEndDateStillSuggested(intakeDates.durationSuggested);
    if (!draft.startDate && !draft.datesExplicit && draft.durationDays) {
      const durationEnd = new Date(`${draft.startDate || today}T00:00:00`);
      durationEnd.setDate(durationEnd.getDate() + Math.max(1, draft.durationDays) - 1);
      setEndDate(iso(durationEnd));
    }
    if (draft.datesExplicit) setDatesManuallyEdited(true);
    if (draft.travellersExplicit) setTravellersManuallyEdited(true);
    if (homeTripDraftInterestsWereExplicit(draft)) setInterestsManuallyEdited(true);
    if (draft.budget) setBudget(draft.budget);
    setBudgetPreference(draft.budgetPreference);
    const regions = draft.regions?.filter(Boolean) ?? [];
    setTripBrief(draft.brief ?? (regions.length ? regions.join(", ") : ""));
    const homeStructuredBrief = draft.structuredBrief ?? extractStructuredTripBrief(draft.brief ?? "");
    const structuredTransportModes = homeStructuredBrief.transportPreferences
      .map((preference) => preference.value)
      .filter((mode): mode is TripTransportMode => mode === "flight" || mode === "train" || mode === "drive");
    const structuredInterests = normalizeTripInterests(homeStructuredBrief.interests.map((interest) => interest.value));
    const handoffInterests = tripInterestsFromHomeDraft(draft, structuredInterests);
    const structuredAvoidDriving = homeStructuredBrief.hardConstraints.some((constraint) => constraint.type === "no-driving");
    const structuredFixedCommitments = fixedTripCommitmentsFromStructuredBrief(homeStructuredBrief);
    setTripIntent((current) => ({
      ...current,
      route: draft.routeIntent,
      timing: {
        ...current.timing,
        flexibility: homeTripDraftTimingFlexibility(draft!, current.timing.flexibility),
        durationDays: draft?.durationDays ?? current.timing.durationDays,
      },
      travellers: Math.max(1, Math.min(12, Math.round(
        (draft?.travellersExplicit ? draft.travellers : homeStructuredBrief.travellers?.value ?? draft?.travellers)
          ?? current.travellers,
      ))),
      preferences: {
        ...current.preferences,
        transportModes: structuredTransportModes.length ? structuredTransportModes : current.preferences.transportModes,
        pace: homeStructuredBrief.pace?.value ?? current.preferences.pace,
        interests: handoffInterests.length || homeTripDraftInterestsWereExplicit(draft)
          ? handoffInterests
          : current.preferences.interests,
      },
      hardConstraints: { ...current.hardConstraints, fixedCommitments: structuredFixedCommitments, avoidDriving: structuredAvoidDriving || current.hardConstraints.avoidDriving },
      journeyEnd: capturedJourneyEnd,
    }));
    setCapturedStructuredBrief(homeStructuredBrief);
    setPlanningSuggestions(draft.planningSuggestions ?? []);
    setPlaceSelections(homeStructuredBrief.placeSelections ?? []);
    setCompletedPlanningAreaMentionIds(completedPlanningAreasForBrief(homeStructuredBrief));
    setRemovedPlaceMentionIds(homeStructuredBrief.removedPlaceMentionIds ?? []);
    const locationMentions = homeStructuredBrief.placeMentions ?? draft.locationMentions ?? [];
    handoffOccurrenceMentionIdsRef.current = draft.homepage?.occurrenceMentionIds ?? {};
    const initialStops = initialHandoffRouteStops(locationMentions, draftStops, capturedJourneyEnd);
    if (initialStops.length) setStops(initialStops);
    handoffLookupSessionRef.current?.controller.abort();
    const lookupSession = {
      controller: new AbortController(),
      statuses: new Map<string, "pending" | "resolved" | "needs-confirmation" | "failed">(),
      handled: new Set<string>(),
      retry: undefined as ((mentionId: string) => void) | undefined,
      replayPending: undefined as (() => void) | undefined,
    };
    handoffLookupSessionRef.current = lookupSession;
    setLocationChoices([]);
    if (locationMentions.length) {
      setIntakeMentions(locationMentions);
      const lookupMentions = handoffLookupMentions(locationMentions);
      lookupMentions.forEach((mention) => lookupSession.statuses.set(mention.mentionId, "pending"));
      setHandoffResolutionStatuses(Object.fromEntries(lookupMentions.map((mention) => [mention.mentionId, "pending" as const])));
      // Canonical handoffs are already valid route input. Provider
      // lookups may enrich them, but their timing must not suppress the
      // itinerary or create a browser-dependent false validation block.
      setResolvingLocations(Boolean(lookupMentions.length) && !builderRouteInputIsReady(initialStops));
      const originVersion = originResolutionVersionRef.current;
      const seedById = new Map(initialStops.map((stop) => [stop.id, stop]));
      const lookupOwnerId = activeBrowserOwnerIdRef.current;
      const lookupTripId = draft.homepage?.receipt?.tripId ?? tripId;
      const intakeSelectionKeys = new Set((homeStructuredBrief.placeSelections ?? []).map(authoredContentKey));
      const pendingHandoffOutcomes: Array<{item:CapturedLocation;value?:LocationChoice[];status:"resolved"|"failed"|"timeout"}> = [];
      // Let the builder render immediately. These requests enrich the
      // route after arrival instead of holding the homepage transition.
      const lookupKey = (mention: CapturedLocation) => `${mention.canonicalName.toLocaleLowerCase()}\u001f${mention.parentCountries.length === 1 ? mention.parentCountries[0]!.toLocaleLowerCase() : ""}`;
      const resolveMention = createHandoffSharedLookup(lookupKey, async (mention: CapturedLocation, signal) => {
        const country = mention.parentCountries.length === 1 ? mention.parentCountries[0] : undefined;
        const response = await fetch(`/api/journey-geocode?place=${encodeURIComponent(mention.canonicalName)}&candidates=1${country ? `&country=${encodeURIComponent(country)}` : ""}`, { signal });
        if (!response.ok) throw new Error("Place lookup unavailable");
        const payload = await response.json() as { candidates?: LocationChoice[] };
        return payload.candidates ?? [];
      }, lookupSession.controller.signal);
      const onOutcome = ({ item: mention, value: choices, status }: {
        item: CapturedLocation; value?: LocationChoice[]; status: "resolved" | "failed" | "timeout";
      }) => {
          if (!isCurrent() || handoffLookupSessionRef.current !== lookupSession) return;
          const editor=builderEditSessionRef.current;
          const snapshot=editor?.getSnapshot();
          if(activeBrowserOwnerIdRef.current!==lookupOwnerId
            || (snapshot && (snapshot.browserOwnerId!==lookupOwnerId || snapshot.trip.id!==lookupTripId)))return;
          // Once the canonical document is reserved, raw React state cannot
          // advance it. Replay through the edit owner when mounting completes.
          if (!editor && builderSeedPendingRef.current) {
            pendingHandoffOutcomes.push({item:mention,value:choices,status});
            return;
          }
          if(snapshot) {
            const trip=snapshot.trip;
            const prior=trip.brief.structuredBrief?.placeMentions?.find(item=>item.mentionId===mention.mentionId);
            if(!prior || authoredContentKey(prior)!==authoredContentKey(mention))return;
            if(isOriginMention(mention)) {
              if(draft.origin || originResolutionVersionRef.current!==originVersion)return;
            } else {
              const intent=trip.brief.intent.route.destinations.find(item=>item.id===mention.mentionId);
              if(!intent)return;
              const seedId=handoffStopOccurrenceId(mention,handoffOccurrenceMentionIdsRef.current);
              const seed=seedById.get(seedId);
              const oldStop=intent.stopIds.length===1?trip.stops.find(stop=>stop.id===intent.stopIds[0]):undefined;
              if(seed && oldStop && savedTargetKey(stopGeographicPlace(oldStop))!==savedTargetKey(seed))return;
              if(seed && !oldStop && (intent.resolution==='resolved' || intent.stopIds.length))return;
              if(!seed && (intent.resolution==='resolved' || intent.stopIds.length))return;
            }
          }
          const currentStatus = lookupSession.statuses.get(mention.mentionId);
          if (!handoffOutcomeIsCurrent(mention.mentionId, currentStatus,
            removedPlaceMentionIdsRef.current, [...lookupSession.handled, ...placeSelectionsRef.current
              .filter(selection => !intakeSelectionKeys.has(authoredContentKey(selection))).map(selection => selection.mentionId)])) {
            if (currentStatus === "pending") {
              lookupSession.statuses.delete(mention.mentionId);
              setHandoffResolutionStatuses((current) => retireHandoffResolutionStatus(current, mention.mentionId));
            }
            return;
          }
          if (status !== "resolved") {
            lookupSession.statuses.set(mention.mentionId, "failed");
            setHandoffResolutionStatuses((current) => ({ ...current, [mention.mentionId]: "failed" }));
            return;
          }
          const candidates = (choices ?? []).filter(referenceGeographicAcceptanceMatches);
          const chosen = preferredHandoffLocationChoice(mention, candidates);
          const needsConfirmation = mention.status === "unresolved" || !chosen;
          const nextStatus = needsConfirmation ? "needs-confirmation" : "resolved";
          lookupSession.statuses.set(mention.mentionId, nextStatus);
          setHandoffResolutionStatuses((current) => ({ ...current, [mention.mentionId]: nextStatus }));
          if (needsConfirmation) {
            setLocationChoices((current) => [...current.filter(({ mention: prior }) => prior.mentionId !== mention.mentionId), { mention, choices: candidates }]);
            return;
          }
          if (!chosen) return;
          if(editor) {
            const trip=editor.getSnapshot().trip;
            const prior=trip.brief.structuredBrief?.placeMentions?.find(item=>item.mentionId===mention.mentionId);
            if(!prior || authoredContentKey(prior)!==authoredContentKey(mention))return;
            if(isOriginMention(mention) && (draft.origin || originResolutionVersionRef.current!==originVersion))return;
            const intent=trip.brief.intent.route.destinations.find(item=>item.id===mention.mentionId);
            const stopId=intent?.stopIds.length===1?intent.stopIds[0]!:handoffStopOccurrenceId(mention,handoffOccurrenceMentionIdsRef.current);
            const oldStop=trip.stops.find(stop=>stop.id===stopId),seed=seedById.get(stopId);
            if(oldStop && seed && savedTargetKey(stopGeographicPlace(oldStop))!==savedTargetKey(seed))return;
            const place=acceptedGeographicPlace({name:mention.canonicalName,coordinates:chosen.coordinates,canonicalPlaceId:mention.canonicalPlaceId??chosen.canonicalPlaceId??(chosen.providerId?`open-world:${chosen.providerId}`:undefined),country:chosen.country,providerId:chosen.providerId},chosen,isOriginMention(mention)?'endpoint':'stop');
            if(!place)return;
            const command=isOriginMention(mention)?{kind:"origin" as const,place}:builderPlaceCommand(trip,{stopId,intentId:intent?.id,place});
            dispatchAcceptedBuilderEdit(command,{expectedInputRevision:snapshot!.inputRevision});return;
          }
          if (isOriginMention(mention)) {
            if (draft.origin || originResolutionVersionRef.current !== originVersion) return;
            const place = acceptedGeographicPlace({
              name: mention.canonicalName,
              coordinates: chosen.coordinates,
              canonicalPlaceId: mention.canonicalPlaceId ?? chosen.canonicalPlaceId ?? (chosen.providerId ? `open-world:${chosen.providerId}` : undefined),
              country: chosen.country,
              providerId: chosen.providerId,
            }, chosen, 'endpoint');
            if (place) replaceJourneyOrigin(place);
          } else {
            const stopId = handoffStopOccurrenceId(mention, handoffOccurrenceMentionIdsRef.current);
            const seed = seedById.get(stopId);
            setStops((current) => current.some((stop) => stop.id === stopId
              && seed && savedTargetKey(stop) === savedTargetKey(seed))
              ? mergeHandoffLocationChoice(current, mention, chosen, stopId) : current);
          }
      };
      lookupSession.replayPending = () => {
        for (const outcome of pendingHandoffOutcomes.splice(0)) onOutcome(outcome);
      };
      const runLookups = (items: CapturedLocation[]) => {
        return void resolveHandoffIncrementally(items, resolveMention, {
        signal: lookupSession.controller.signal, onOutcome,
      }).finally(() => {
        if (isCurrent() && handoffLookupSessionRef.current === lookupSession) setResolvingLocations(false);
      });};
      lookupSession.retry = (mentionId) => {
        const mention = lookupMentions.find((item) => item.mentionId === mentionId);
        if (!mention || lookupSession.statuses.get(mentionId) !== "failed" || !isCurrent()) return;
        lookupSession.statuses.set(mentionId, "pending");
        setHandoffResolutionStatuses((current) => ({ ...current, [mentionId]: "pending" }));
        runLookups([mention]);
      };
      runLookups(lookupMentions);
    } else {
      setHandoffResolutionStatuses({});
      setResolvingLocations(false);
    }
  };

  const submitNewTripIntake = async (snapshot: HomepageInputSnapshot) => {
    const submittedAt = performance.now();
    if (!hydrated || !canUseHydratedTripScope(hydratedOwnerScopeRef.current, activeBrowserOwnerId)
      || snapshot.ownerId !== activeBrowserOwnerId || hasRouteSkeleton || hasPromptContext) throw new Error("New trip intake is no longer current");
    if (snapshot.mode === "describe") {
      const reservation = await reserveDirectDescribeIntake({
        storage: window.localStorage, snapshot, tripId, handoffId: `new-intake-${crypto.randomUUID()}`,
      });
      if (!reservation.ok || !canUseHydratedTripScope(hydratedOwnerScopeRef.current, snapshot.ownerId)
        || activeBrowserOwnerIdRef.current !== snapshot.ownerId) throw new Error("New trip intake could not be reserved");
      const receipt = reservation.receipt;
      markPlanningMilestone(receipt.handoffId, "submit", submittedAt);
      markPlanningMilestone(receipt.handoffId, "durable-intake");
      planningAttemptIdRef.current = receipt.handoffId;
      planningModeRef.current = "describe";
      setTripId(receipt.tripId);
      pendingInterpretationRef.current = receipt;
      setPendingInterpretation({ receipt, fromHomepage: false });
      setTripBrief(receipt.frozenSnapshot.prompt);
      setHasPromptContext(true);
      setEntryKind("pending-direct-intake");
      return;
    }
    const handoffId = `new-intake-${crypto.randomUUID()}`;
    const projected = projectHomepageInput({ snapshot, profile: hasSavedTravelProfile ? travelProfile : null, handoffId });
    if (!projected.ok) throw new Error("New trip intake needs review");
    const receipt = homepageReceiptForProjection(snapshot, projected.draft, tripId);
    markPlanningMilestone(receipt.handoffId, "submit", submittedAt);
    planningAttemptIdRef.current = receipt.handoffId;
    planningModeRef.current = "stops";
    // The completed receipt must follow canonical recovery, so a reload while
    // the Builder is still saving can restore the traveller's original intake.
    const frozenInput = await persistEditableHomepageInput({ storage: window.localStorage, snapshot,
      isCurrent: () => canUseHydratedTripScope(hydratedOwnerScopeRef.current, snapshot.ownerId)
        && activeBrowserOwnerIdRef.current === snapshot.ownerId });
    if (!frozenInput.ok) throw new Error("New trip input did not persist");
    markPlanningMilestone(receipt.handoffId, "durable-intake");
    pendingNewTripReceiptRef.current = { snapshot, receipt, draft: { ...projected.draft, homepage: { ...projected.draft.homepage!, receipt } } };
    applyNewTripIntake(projected.draft, () => canUseHydratedTripScope(hydratedOwnerScopeRef.current, snapshot.ownerId));
  };

  const applyAcceptedBuilderDocument = (saved: EasyTTrip) => {
    hydratedCanonicalTripRef.current = saved;
    if (builderEditSessionRef.current) return;
    setTripId(saved.id);
    setTripOwnerId(saved.ownerId);
    setTripStatus(saved.status);
    setCreatedAt(saved.createdAt);
    setTripUpdatedAt(saved.updatedAt);
    replaceJourneyOrigin(originPlaceFromBrief(saved.brief));
    setTripBrief(saved.brief.mustDo);
    const savedJourneyEnd = normalizeJourneyEnd(saved.brief.journeyEnd);
    setJourneyEnd(savedJourneyEnd);
    setJourneyEndInput(savedJourneyEnd.mode === "explicit" ? savedJourneyEnd.place.name : "");
    setSourceRouteKey(saved.brief.sourceRouteKey);
    setCuratedRoute(saved.brief.curatedRoute);
    setStops(saved.stops.map(({ id, name, country, canonicalPlaceId, countryCode, region, providerId, longitude, latitude, geographicBinding }) => ({ id, name, country, canonicalPlaceId, countryCode, region, providerId, coordinates: longitude !== null && latitude !== null ? [longitude, latitude] : undefined, ...(geographicBinding===undefined?{}:{geographicBinding:structuredClone(geographicBinding)}) })));
    setStartDate(saved.startDate);
    setEndDate(saved.endDate);
    setEndDateStillSuggested(saved.brief.endDateIsSuggestion === true);
    setPicks(saved.brief.selectedPlaces);
    setDayAllocations(saved.brief.nightAllocations ?? (saved.brief.nightAllocation && saved.brief.nightAllocation.state !== "conflict"
      ? saved.brief.nightAllocation.allocations
      : saved.brief.dayAllocations ?? {}));
    setManualNightStopIds(saved.brief.manualNightStopIds ?? []);
    setBudget(saved.brief.budgetBand);
    setBudgetPreference(saved.brief.budgetPreference);
    const savedIntent = tripIntentForTrip(saved);
    setTripIntent(savedIntent);
    const savedStructuredBrief = saved.brief.structuredBrief
      ? mergeStructuredTripBrief(saved.brief.structuredBrief, { interests: savedIntent.preferences.interests })
      : structuredTripBriefFromSavedSelections({
      destinations: [
        ...(saved.brief.origin ? [{ name: saved.brief.origin, canonicalPlaceId: saved.brief.originCanonicalPlaceId, parentCountries: saved.brief.originCountry ? [saved.brief.originCountry] : undefined, role: "arrival-gateway" as const, priority: "required" as const }] : []),
        ...saved.stops.map((stop) => ({ id: stop.id, name: stop.name, role: "preferred" as const, priority: "normal" as const })),
      ],
      travellers: saved.travellers,
      dates: { start: saved.startDate, end: saved.endDate, fixed: saved.brief.intent?.timing.flexibility === "fixed" },
      pace: savedIntent.preferences.pace,
      interests: savedIntent.preferences.interests,
      transportPreferences: savedIntent.preferences.transportModes,
      budget: saved.brief.budgetBand,
      avoidDriving: savedIntent.hardConstraints.avoidDriving,
    });
    setCapturedStructuredBrief(savedStructuredBrief);
    setIntakeMentions(savedStructuredBrief.placeMentions ?? []);
    setPlaceSelections(savedStructuredBrief.placeSelections ?? []);
    setCompletedPlanningAreaMentionIds(completedPlanningAreasForBrief(savedStructuredBrief));
    setRemovedPlaceMentionIds(savedStructuredBrief.removedPlaceMentionIds ?? []);
    setScheduleLocks(saved.brief.scheduleLocks ?? { stopIds: [], arrivalDates: {} });
    setDecisionSelections(saved.brief.decisionSelections ?? { transportByLeg: {} });
    setHasPromptContext(true);
  };

  const dispatchAcceptedBuilderEdits = (edits: readonly BuilderAcceptedEdit[], options?: {
    expectedInputRevision?: number; acceptedInputs?: readonly { binding: BuilderInputBinding; raw: string }[];
  }) => {
    const editor = builderEditSessionRef.current;
    if (!editor) return false;
    if (!edits.length) return true;
    const result = editor.acceptBatch(edits, options?.expectedInputRevision ?? editor.getSnapshot().inputRevision, options?.acceptedInputs);
    if (!result.ok) {
      setCloudSaveError(result.reason === "stale-source"
        ? "The trip changed while this edit was being checked. Review the latest trip and try again."
        : "This edit could not be accepted safely. Your current trip and input remain preserved.");
      return false;
    }
    applyAcceptedBuilderDocument(result.trip);
    setCloudSaveError("");
    setSaveState(editor.getSnapshot().saveState);
    return true;
  };
  const dispatchAcceptedBuilderEdit = (edit: BuilderAcceptedEdit | null, options?: {
    expectedInputRevision?: number; acceptedInput?: { binding: BuilderInputBinding; raw: string };
  }) => edit !== null && dispatchAcceptedBuilderEdits([edit], {
    expectedInputRevision: options?.expectedInputRevision,
    acceptedInputs: options?.acceptedInput ? [options.acceptedInput] : undefined,
  });

  const updateDiscoveryPlanningState = (update: (current: StructuredTripBrief) => StructuredTripBrief) => {
    const editor=builderEditSessionRef.current;
    if(!editor){setCapturedStructuredBrief(update);return;}
    const current=editor.getSnapshot().trip.brief.structuredBrief;if(!current)return;
    const next=update(structuredClone(current));
    const {discoveryDraftByMentionId:_oldDrafts,countryDiscoveryChoices:_oldChoices,...oldFields}=current;
    const {discoveryDraftByMentionId:_newDrafts,countryDiscoveryChoices:_newChoices,...newFields}=next;
    if(JSON.stringify(oldFields)!==JSON.stringify(newFields))return;
    const commands:BuilderAcceptedEdit[]=[];
    for(const mention of current.placeMentions??[]){
      const id=mention.mentionId,draft=next.discoveryDraftByMentionId?.[id],choiceIds=next.countryDiscoveryChoices?.[id];
      const changedDraft=JSON.stringify(draft)!==JSON.stringify(current.discoveryDraftByMentionId?.[id]);
      const changedChoices=JSON.stringify(choiceIds)!==JSON.stringify(current.countryDiscoveryChoices?.[id]);
      if(changedDraft || changedChoices)commands.push({kind:"discovery-state",mentionId:id,...(changedDraft && draft?{draft}:{}),...(changedChoices && choiceIds?{choiceIds}:{})});
    }
    if(commands.length)dispatchAcceptedBuilderEdits(commands);
  };

  useEffect(() => {
    if (sessionPending || !browserContextReady) return;
    if (canUseHydratedTripScope(hydratedOwnerScopeRef.current, activeBrowserOwnerId)) return;
    const previousOwnerScope = hydratedOwnerScopeRef.current;
    hydratedOwnerScopeRef.current = undefined;
    setBuilderSeed(null);
    builderSeedPendingRef.current = false;
    pendingNewTripReceiptRef.current = null;
    receiptAcknowledgementRef.current = null;
    pendingInterpretationRef.current = null;
    planningAttemptIdRef.current = null;
    activeProjectionTokenRef.current = null;
    handoffLookupSessionRef.current?.controller.abort();
    handoffLookupSessionRef.current = null;
    setPendingInterpretation(null);
    captureRequestGateRef.current?.cancel();
    recoveryHandleRef.current = null;
    hydratedCanonicalTripRef.current = null;
    setHydrated(false);
    setEntryKind("loading");
    setResumedQuerylessDraft(false);
    setTripUnavailable(false);
    let active = true;
    const applySaved = (saved: ReturnType<typeof loadActiveTrip>) => {
      if (saved && active) applyAcceptedBuilderDocument(saved);
    };
    const hydrate = async () => {
      const params = new URLSearchParams(window.location.search);
      const activeOwnerId = activeBrowserOwnerId;
      const legacyStep = params.get("step");
      if (legacyStep !== null && /^(0|1|2)$/.test(legacyStep)) {
        legacyFocusRef.current = legacyStep === "0" ? "summary" : "timing";
      }
      const tripIdFromUrl = params.get("trip");
      let hydratedEntryKind: NewTripEntryState["kind"] = tripIdFromUrl ? "explicit-trip"
        : params.get("homeDraft") === "1" ? "home-handoff"
        : params.has("inspire") ? "route-handoff" : "fresh";
      const showItinerary = params.get("view") === "itinerary";
      if (!tripIdFromUrl && typeof previousOwnerScope === "string" && previousOwnerScope !== activeOwnerId) {
        if (active) {
          hydratedOwnerScopeRef.current = activeOwnerId;
          setTripUnavailable(true);
          setEntryKind("unavailable");
          setHydrated(true);
        }
        return;
      }
      if (tripIdFromUrl) {
        const explicitRecovery = params.get("recover") === "1";
        if (authenticatedOwnerId && explicitRecovery) {
          const claimed = claimGuestTripRecoveryForOwner(tripIdFromUrl, authenticatedOwnerId);
          if (claimed?.stored) recoveryHandleRef.current = claimed.handle;
        }
        const ownerScope = activeOwnerId;
        const requestedRecovery = explicitRecovery ? loadTripRecovery(tripIdFromUrl, ownerScope) : null;
        const requestedTrip = requestedRecovery?.trip ?? await loadRequestedTrip(tripIdFromUrl, ownerScope);
        if (!active) return;
        if (requestedTrip) {
          const matchingRecovery = requestedRecovery ?? loadTripRecovery(tripIdFromUrl, ownerScope);
          recoveryHandleRef.current = matchingRecovery
            && JSON.stringify(matchingRecovery.trip) === JSON.stringify(requestedTrip)
            ? matchingRecovery
            : null;
          applySaved(requestedTrip);
          if (showItinerary) setGenerated(true);
        } else {
          setTripUnavailable(true);
        }
      } else {
        if (!params.has("homeDraft") && !params.has("inspire")) {
          const currentDraft = loadCurrentDraftRecovery(activeOwnerId);
          if (currentDraft && active) {
            recoveryHandleRef.current = currentDraft;
            applySaved(currentDraft.trip);
            setResumedQuerylessDraft(true);
            setEntryKind("current-draft");
            hydratedOwnerScopeRef.current = activeOwnerId;
            setHydrated(true);
            return;
          }
        }
        if (activeOwnerId) {
          if (previousOwnerScope === null) {
            const claimed = claimGuestTripRecoveryForOwner(tripId, activeOwnerId);
            if (claimed?.stored) recoveryHandleRef.current = claimed.handle;
          }
        }
        try {
          const savedProfile = JSON.parse(window.localStorage.getItem(travelProfileStorageKey(activeBrowserOwnerId)) ?? "null");
          const profile = travelProfileFromUnknown(savedProfile);
          if (profile) {
            setBudget(profile.budget);
            setTravelProfile(profile);
            setHasSavedTravelProfile(true);
            setTripIntent((current) => ({
              ...current,
              preferences: {
                ...current.preferences,
                interests: tripInterestsWithProfileDefaults(current.preferences.interests, profile, interestsManuallyEdited),
              },
            }));
          }
        } catch { setBudget(defaultTravelProfile.budget); }
        const receivingHomeDraft = params.get("homeDraft") === "1";
        let homeDraft: HomeTripDraft | PendingHomeTripHandoff | null = null;
        let storedHomepageInput = null;
        if (receivingHomeDraft) {
          try { homeDraft = JSON.parse(window.localStorage.getItem(HOME_TRIP_DRAFT_KEY) ?? "null"); } catch { homeDraft = null; }
        }
        try {
          storedHomepageInput = readHomepageInput(JSON.parse(window.localStorage.getItem(homepageInputStorageKey(activeOwnerId)) ?? "null"), activeOwnerId);
        } catch { storedHomepageInput = null; }
        if (!homeDraft && !receivingHomeDraft) {
          const routeDetail = publicRouteDetailFor(params.get("inspire") ?? "");
          if (routeDetail) homeDraft = routePlannerPayload(routeDetail.planDraft);
        }
        let resumedHomepageTrip = false;
        let pendingEntryActive = false;
        const startPending = (receipt: PendingIntakeReceipt, fromHomepage: boolean) => {
          planningAttemptIdRef.current = receipt.handoffId;
          planningModeRef.current = receipt.frozenSnapshot.mode;
          setTripId(receipt.tripId);
          pendingInterpretationRef.current = receipt;
          setPendingInterpretation({ receipt, fromHomepage });
          setTripBrief(receipt.frozenSnapshot.prompt);
          setHasPromptContext(true);
          setArrivedFromHomepage(fromHomepage);
          hydratedEntryKind = fromHomepage ? "pending-home-handoff" : "pending-direct-intake";
          pendingEntryActive = true;
        };
        if (!receivingHomeDraft && !params.has("inspire")) {
          const pending = storedHomepageInput?.receipt
            && pendingIntakeReceiptForOwner(storedHomepageInput.receipt, activeOwnerId);
          if (pending) {
            const existingRecovery = loadTripRecovery(pending.tripId, activeOwnerId);
            const existingTrip = existingRecovery?.trip ?? await loadRequestedTrip(pending.tripId, activeOwnerId);
            if (!active) return;
            if (existingTrip) {
              recoveryHandleRef.current = existingRecovery ?? null;
              applySaved(existingTrip);
              resumedHomepageTrip = true;
              hydratedEntryKind = "explicit-trip";
            } else startPending(pending, false);
          }
        }
        if (receivingHomeDraft) {
          if (homeDraft && "version" in homeDraft && homeDraft.version === 2) {
            const pendingEnvelope = pendingHomepageHandoffForOwner(homeDraft, activeOwnerId, params.get("handoff") ?? "");
            const existingRecovery = pendingEnvelope ? loadTripRecovery(pendingEnvelope.tripId, activeOwnerId) : null;
            const existingTrip = pendingEnvelope
              ? existingRecovery?.trip ?? await loadRequestedTrip(pendingEnvelope.tripId, activeOwnerId)
              : null;
            if (!active) return;
            const entry = resolveNewTripEntryState({
              hydrated: true, ownerId: activeOwnerId, homeDraft: true,
              handoff: params.get("handoff"), storedInput: storedHomepageInput, draft: homeDraft,
              reservedTripId: existingTrip?.id,
            });
            if (entry.kind === "pending-home-handoff" && storedHomepageInput?.receipt?.version === 2) {
              const pending = storedHomepageInput.receipt;
              startPending(pending, true);
            } else if (entry.kind === "explicit-trip" && existingTrip && existingTrip.id === entry.tripId) {
              recoveryHandleRef.current = existingRecovery ?? null;
              applySaved(existingTrip);
              resumedHomepageTrip = true;
              hydratedEntryKind = "explicit-trip";
            } else {
              setTripUnavailable(true);
              hydratedEntryKind = "unavailable";
            }
            homeDraft = null;
          }
        }
        if (receivingHomeDraft && !pendingEntryActive && !resumedHomepageTrip && hydratedEntryKind !== "unavailable") {
          if (!homeDraft && storedHomepageInput?.receipt
            && storedHomepageInput.receipt.handoffId === params.get("handoff")) {
            const reservedId = storedHomepageInput.receipt.tripId;
            const existingRecovery = loadTripRecovery(reservedId, activeOwnerId);
            const existingTrip = existingRecovery?.trip ?? await loadRequestedTrip(reservedId, activeOwnerId);
            if (!active) return;
            const entry = resolveNewTripEntryState({
              hydrated: true, ownerId: activeOwnerId, homeDraft: true,
              handoff: params.get("handoff"), storedInput: storedHomepageInput,
              reservedTripId: existingTrip?.id,
            });
            if (entry.kind === "explicit-trip" && existingTrip) {
              recoveryHandleRef.current = existingRecovery
                ? { ownerId: existingRecovery.ownerId, tripId: existingRecovery.tripId, writeId: existingRecovery.writeId }
                : null;
              applySaved(existingTrip);
              resumedHomepageTrip = true;
              setArrivedFromHomepage(true);
              hydratedEntryKind = "explicit-trip";
            } else { setTripUnavailable(true); hydratedEntryKind = "unavailable"; }
          } else {
            const entry = resolveNewTripEntryState({
              hydrated: true, ownerId: activeOwnerId, homeDraft: true,
              handoff: params.get("handoff"), storedInput: storedHomepageInput, draft: homeDraft,
            });
            if (entry.kind === "unavailable") {
              homeDraft = null;
              setTripUnavailable(true);
              hydratedEntryKind = "unavailable";
            }
          }
        }
        if (homeDraft && "homepage" in homeDraft && homeDraft.homepage) {
          const homepageReceipt = homepageHandoffReceiptForOwner(homeDraft, activeOwnerId);
          if (!homepageReceipt) {
            // A versioned handoff is private state. Invalid owner or receipt
            // metadata must fail closed instead of being treated as legacy.
            homeDraft = null;
          } else {
            // Reserve the canonical identity before any recovery/save effect can
            // observe the random ID created for a direct Builder visit.
            setTripId(homepageReceipt.tripId);
            const existingRecovery = loadTripRecovery(homepageReceipt.tripId, activeOwnerId);
            const existingHomepageTrip = existingRecovery?.trip
              ?? await loadRequestedTrip(homepageReceipt.tripId, activeOwnerId);
            if (!active) return;
            if (existingHomepageTrip) {
              homeDraftRef.current = homeDraft;
              setArrivedFromHomepage(true);
              recoveryHandleRef.current = existingRecovery
                ? { ownerId: existingRecovery.ownerId, tripId: existingRecovery.tripId, writeId: existingRecovery.writeId }
                : null;
              applySaved(existingHomepageTrip);
              if (existingRecovery && homepageHandoffMatchesTrip(homeDraft, existingHomepageTrip)) {
                await removeHomeTripDraftIfDurable(window.localStorage, homeDraft, existingHomepageTrip, true, false);
                if (!active) return;
              }
              resumedHomepageTrip = true;
              hydratedEntryKind = "explicit-trip";
            }
          }
        }
        if (!resumedHomepageTrip && !pendingEntryActive && homeDraft && !("version" in homeDraft)
          && (homeDraft.brief || homeDraft.origin || homeDraft.destination || homeDraft.destinations?.length || homeDraft.locationMentions?.length)) {
          applyNewTripIntake(homeDraft, () => active, true);
        } else {
          const seed = inspirationByKey[params.get("inspire") ?? ""];
          if (seed) {
          setHasPromptContext(true);
          const seedOrigin = canonicalPlaceSuggestionFor(seed.origin);
          replaceJourneyOrigin({
            name: seed.origin,
            coordinates: seed.originCoordinates,
            canonicalPlaceId: seedOrigin?.canonicalPlaceId,
            country: seedOrigin?.country,
          });
          setStops(seed.stops);
          // A route has its own starting level, but an account preference still
          // wins when present so the plan reflects the traveller, not the card.
          try {
            const savedProfile = JSON.parse(window.localStorage.getItem(travelProfileStorageKey(activeBrowserOwnerId)) ?? "null");
            const profile = travelProfileFromUnknown(savedProfile);
            if (profile) {
              setBudget(profile.budget);
              setTravelProfile(profile);
              setHasSavedTravelProfile(true);
              setTripIntent((current) => ({
                ...current,
                preferences: {
                  ...current.preferences,
                  interests: tripInterestsWithProfileDefaults(current.preferences.interests, profile, interestsManuallyEdited),
                },
              }));
            } else setBudget(seed.budget);
            } catch { setBudget(seed.budget); }
          }
        }
      }
      if (active) {
        hydratedOwnerScopeRef.current = activeOwnerId;
        setEntryKind(hydratedEntryKind);
        setHydrated(true);
      }
    };
    void hydrate();
    return () => { active = false; };
  }, [activeBrowserOwnerId, authenticatedOwnerId, browserContextReady, sessionPending]);

  useEffect(() => {
    if (!hydrated || !pendingInterpretation) return;
    const { receipt, fromHomepage } = pendingInterpretation;
    const domainMessage = (fields: string[]) => currentPresentationRef.current.language === "es"
      ? fields.includes("tripType") ? "Revisa cómo termina tu viaje. Edita la idea para continuar." : "Revisa los datos de tu viaje. Edita la idea para continuar."
      : fields.includes("tripType") ? "Review how your trip ends. Edit your trip idea to continue." : "Review your trip details. Edit your trip idea to continue.";
    const request = captureRequestGateRef.current!.begin();
    const isCurrent = () => request.isCurrent()
      && pendingInterpretationRef.current?.handoffId === receipt.handoffId
      && pendingInterpretationRef.current?.tripId === receipt.tripId
      && pendingInterpretationRef.current?.semanticInputFingerprint === receipt.semanticInputFingerprint
      && pendingInterpretationRef.current?.inputRevision === receipt.inputRevision
      && canUseHydratedTripScope(hydratedOwnerScopeRef.current, receipt.ownerId)
      && activeBrowserOwnerIdRef.current === receipt.ownerId
      && pendingReceiptStillCurrent(window.localStorage, receipt, fromHomepage);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const stored = readHomepageInput(JSON.parse(window.localStorage.getItem(homepageInputStorageKey(receipt.ownerId)) ?? "null"), receipt.ownerId);
          if (isCurrent() && stored?.review?.phase === "blocked" && stored.review.receipt.handoffId === receipt.handoffId
            && stored.review.receipt.tripId === receipt.tripId && stored.review.receipt.inputRevision === receipt.inputRevision
            && stored.review.receipt.semanticInputFingerprint === receipt.semanticInputFingerprint
            && stored.review.sourceKey === homepageDescribeSourceKey(receipt.frozenSnapshot)) {
            setPendingFailureKind("domain");
            setTripBriefCaptureError(domainMessage(stored.review.issues.map(issue => issue.field)));
            return;
          }
          const capture = receipt.frozenSnapshot.mode === "describe"
            ? await requestJourneyCapture(receipt.frozenSnapshot.prompt, { mode: "intent-only", signal: request.signal })
            : undefined;
          if (!isCurrent()) return;
          const projected = projectHomepageInput({
            snapshot: receipt.frozenSnapshot,
            capture,
            profile: currentPresentationRef.current.hasSavedTravelProfile ? currentPresentationRef.current.travelProfile : null,
            handoffId: receipt.handoffId,
          });
          if (!projected.ok) {
            const retained = await retainPendingIntakeReview({ storage: window.localStorage, receipt, fromHomepage, issues: projected.issues,
              evidence: homepageCapturedRouteEvidence(receipt.frozenSnapshot.prompt, capture), isCurrent });
            if (!isCurrent()) return;
            setPendingFailureKind("domain");
            setTripBriefCaptureError(retained.ok
              ? domainMessage(projected.issues.map(issue => issue.field))
              : (currentPresentationRef.current.language === "es" ? "No pudimos guardar la revisión. Tu idea original sigue guardada." : "We couldn't save this review. Your original trip idea is still preserved."));
            return;
          }
          const completedReceipt = homepageReceiptForProjection(receipt.frozenSnapshot, projected.draft, receipt.tripId);
          const draft: HomeTripDraft = { ...projected.draft,
            homepage: { ...projected.draft.homepage!, receipt: completedReceipt } };
          pendingNewTripReceiptRef.current = {
            snapshot: receipt.frozenSnapshot, receipt: completedReceipt, draft, pending: receipt, fromHomepage,
          };
          activeProjectionTokenRef.current = receipt.handoffId;
          applyNewTripIntake(draft, () => activeProjectionTokenRef.current === receipt.handoffId
            && canUseHydratedTripScope(hydratedOwnerScopeRef.current, receipt.ownerId), fromHomepage);
          pendingInterpretationRef.current = null;
          setPendingInterpretation(null);
          setTripBriefCaptureError("");
          setPendingFailureKind(null);
        } catch {
          if (isCurrent()) {
            planningAttemptOutcome(receipt.handoffId, "error");
            setPendingFailureKind("network");
            setTripBriefCaptureError(journeyCaptureFailureMessage("network", currentPresentationRef.current.language));
          }
        } finally { request.finish(); }
      })();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      captureRequestGateRef.current?.cancel();
    };
  }, [hydrated, pendingInterpretation, pendingInterpretationRetry]);

  const editPendingInterpretation = () => { void (async () => {
    if (!pendingInterpretation || !canUseHydratedTripScope(hydratedOwnerScopeRef.current, pendingInterpretation.receipt.ownerId)) return;
    const { receipt, fromHomepage } = pendingInterpretation;
    const edited = await discardPendingIntakeForEdit({ storage: window.localStorage, receipt, fromHomepage, preserveReview: pendingFailureKind === "domain",
      isCurrent: () => pendingInterpretationRef.current?.handoffId === receipt.handoffId
        && canUseHydratedTripScope(hydratedOwnerScopeRef.current, receipt.ownerId) });
    if (!edited.ok) {
      setTripBriefCaptureError(language === "es" ? "No pudimos guardar el cambio. Inténtalo de nuevo." : "We couldn't save that change. Try again.");
      return;
    }
    captureRequestGateRef.current?.cancel();
    if (pendingFailureKind === "domain" && fromHomepage === true) {
      window.location.assign("/");
      return;
    }
    planningAttemptOutcome(receipt.handoffId, "abandoned");
    pendingInterpretationRef.current = null;
    pendingNewTripReceiptRef.current = null;
    setPendingInterpretation(null);
    setTripBrief("");
    setHasPromptContext(false);
    setArrivedFromHomepage(false);
    setTripId(crypto.randomUUID());
    setEntryKind("fresh");
    setTripBriefCaptureError("");
    setPendingFailureKind(null);
    window.history.replaceState(window.history.state, "", window.location.pathname);
  })(); };

  useEffect(() => {
    stops.forEach((stop) => {
      if (!stop.coordinates || discoveredPlaces[stop.id] || discovering[stop.id]) return;
      setDiscovering((current) => ({ ...current, [stop.id]: true }));
      const [lon, lat] = stop.coordinates;
      fetch(`/api/journey-discover?destination=${encodeURIComponent(stop.name)}&country=${encodeURIComponent(stop.country)}&lat=${lat}&lon=${lon}`)
        .then((response) => response.json())
        .then((payload: { places?: Place[] }) => setDiscoveredPlaces((current) => ({ ...current, [stop.id]: payload.places ?? [] })))
        .catch(() => setDiscoveredPlaces((current) => ({ ...current, [stop.id]: [] })))
        .finally(() => setDiscovering((current) => ({ ...current, [stop.id]: false })));
    });
  }, [stops, discoveredPlaces, discovering]);

  useEffect(() => {
    if (session?.user?.id && tripOwnerId && session.user.id !== tripOwnerId) {
      // Keep the first account's browser copy quarantined, but never leave it
      // visible after this tab observes a different authenticated account.
      window.location.assign("/journey/dashboard");
      return;
    }
    if (hydrated && session?.user?.id && !tripOwnerId) {
      // A recovery scope protects the local document for this account. It is
      // not cloud ownership: the first authenticated write must remain an
      // ownerless promotion until the repository creates the canonical row.
      const claimed = claimGuestTripRecoveryForOwner(tripId, session.user.id);
      if (claimed?.stored) recoveryHandleRef.current = claimed.handle;
    }
  }, [hydrated, session?.user?.id, tripId, tripOwnerId]);

  const totalDays = useMemo(() => {
    const d = Math.round((+new Date(`${endDate}T00:00:00`) - +new Date(`${startDate}T00:00:00`)) / 86400000) + 1;
    return Number.isFinite(d) && d > 0 ? d : 1;
  }, [startDate, endDate]);
  const totalNights = useMemo(() => tripNightsBetween(startDate, endDate), [startDate, endDate]);
  const currentCuratedRoute = useMemo(
    () => reconcileCuratedRouteKnowledge(curatedRoute, stops.map((stop) => stop.id)),
    [curatedRoute, stops],
  );
  const reviewedRouteDraft = useMemo(() => sourceRouteKey ? publicRouteDetailFor(sourceRouteKey)?.planDraft : undefined, [sourceRouteKey]);
  const analyticsTripSource = sourceRouteKey ? "route" as const : arrivedFromHomepage ? "homepage" as const : "builder" as const;
  const isHomepagePromptHandoff = arrivedFromHomepage && !sourceRouteKey;

  const effectiveIntent = useMemo<TripIntent>(() => canonicalBuilder ? canonicalBuilder.brief.intent : ({
    ...tripIntent,
    journeyEnd: normalizeJourneyEnd(journeyEnd),
    timing: { ...tripIntent.timing, durationDays: totalDays },
    hardConstraints: {
      ...tripIntent.hardConstraints,
      originRequired: Boolean(origin.trim()),
      optionalStopIds: tripIntent.hardConstraints.optionalStopIds.filter((id) => stops.some((stop) => stop.id === id)),
      mustSeeStopIds: stops.filter((stop) => !tripIntent.hardConstraints.optionalStopIds.includes(stop.id)).map((stop) => stop.id),
    },
    preferences: { ...tripIntent.preferences, budgetSensitivity: budget },
  }), [canonicalBuilder, tripIntent, journeyEnd, totalDays, origin, stops, budget]);
  const journeyStartPlace = useMemo<JourneyEndpointPlace>(() => ({
    ...journeyOrigin,
    name: origin.trim(),
    canonicalPlaceId: originCanonicalPlaceId,
    country: originCountry,
    providerId: originProviderId,
    coordinates: originCoordinates,
  }), [journeyOrigin, origin, originCanonicalPlaceId, originCountry, originProviderId, originCoordinates]);
  const routeJourneyEnd = useMemo(
    () => plannerEndpointForJourneyEnd(tripId, journeyStartPlace, journeyEnd),
    [tripId, journeyStartPlace, journeyEnd],
  );
  const capturedContextIds = useMemo(() => {
    const ids=geographicContextMentionIds(capturedStructuredBrief.source.rawPrompt ?? "", capturedStructuredBrief.placeMentions ?? intakeMentions, journeyStartPlace ? [journeyStartPlace] : []);
    return canonicalBuilder ? preserveAuthoredCountryContextIntents(canonicalBuilder,ids) : ids;
  }, [capturedStructuredBrief, intakeMentions, journeyStartPlace, canonicalBuilder]);
  const activeCapturedPlaceMentions = useMemo(() => (capturedStructuredBrief.placeMentions ?? intakeMentions)
    .filter((mention) => !removedPlaceMentionIds.includes(mention.mentionId) && !capturedContextIds.has(mention.mentionId)), [capturedStructuredBrief.placeMentions, intakeMentions, removedPlaceMentionIds, capturedContextIds]);
  const effectivePlaceSelections = useMemo(() => inferAttractionVisitSelections(
    activeCapturedPlaceMentions,
    stops.map((stop) => ({
      routeStopId: stop.id,
      name: stop.name,
      canonicalPlaceId: stop.canonicalPlaceId,
      country: stop.country,
      coordinates: stop.coordinates,
    })),
    placeSelections,
  ), [activeCapturedPlaceMentions, placeSelections, stops]);
  const projectedFixedCommitments = useMemo(() => projectFixedCommitmentsToStops(
    effectiveIntent.hardConstraints.fixedCommitments,
    stops,
    effectiveIntent.route?.destinations,
  ), [effectiveIntent.hardConstraints.fixedCommitments, effectiveIntent.route?.destinations, stops]);
  const protectedBuilderStopIds = useMemo(() => [...new Set([
    ...scheduleLocks.stopIds, ...Object.keys(scheduleLocks.arrivalDates),
    ...projectedFixedCommitments.flatMap(item => (item.date || item.commitmentType === 'booking') && item.stopId ? [item.stopId] : []),
    ...(canonicalBuilder?.brief.bookings ?? []).flatMap(booking => {
      const candidates = canonicalBuilder?.stops ?? [];
      const exact = candidates.find(stop => booking.id === `stay-${stop.id}`);
      if (exact) return [exact.id];
      const named = candidates.filter(stop => booking.title.toLocaleLowerCase().includes(stop.name.toLocaleLowerCase()));
      const dated = named.filter(stop => booking.date && stop.arrivalDate && stop.departureDate && booking.date >= stop.arrivalDate && booking.date < stop.departureDate);
      return (dated.length ? dated : named).map(stop => stop.id);
    }),
  ])], [scheduleLocks, projectedFixedCommitments, canonicalBuilder]);
  const fixedBuilderChronology = projectedFixedCommitments.some(item => (item.date || item.commitmentType === 'booking') && !item.stopId);
  const effectiveStructuredBrief = useMemo(() => canonicalBuilder?.brief.structuredBrief ?? mergeStructuredTripBrief(capturedStructuredBrief, {
    ...(datesManuallyEdited ? { duration: { value: totalDays, unit: "days" as const, precision: "exact" as const } } : {}),
    destinations: [
      ...(origin.trim() ? [{
        name: origin.trim(),
        canonicalPlaceId: originCanonicalPlaceId,
        parentCountries: originCountry ? [originCountry] : undefined,
        resolutionStatus: originCoordinates ? "resolved" as const : undefined,
        routability: originCoordinates ? "direct_destination" as const : undefined,
        role: "arrival-gateway" as const,
        priority: "required" as const,
      }] : []),
      ...stops.map((stop) => {
        const selection = effectivePlaceSelections.find((item) => item.routeStopId === stop.id && item.kind !== "visit");
        const selectedMention = selection
          ? capturedStructuredBrief.placeMentions?.find((mention) => mention.mentionId === selection.mentionId)
          : undefined;
        const prior = capturedStructuredBrief.destinations.find((destination) => destination.id === stop.id)
          ?? capturedStructuredBrief.destinations.find((destination) => destination.name.toLocaleLowerCase() === stop.name.toLocaleLowerCase()
            && destination.role !== "arrival-gateway" && destination.role !== "departure-gateway");
        const priorParentWasRemoved = Boolean(prior?.placeMentionId && removedPlaceMentionIds.includes(prior.placeMentionId));
        return {
          id: stop.id,
          name: stop.name,
          canonicalPlaceId: stop.canonicalPlaceId ?? selection?.selectedCanonicalPlaceId ?? prior?.canonicalPlaceId,
          placeMentionId: selection?.mentionId ?? (priorParentWasRemoved ? undefined : prior?.placeMentionId),
          placeType: selection?.selectedPlaceType ?? prior?.placeType ?? (selectedMention ? "town" as const : undefined),
          resolutionStatus: selection ? "resolved" as const : prior?.resolutionStatus ?? "resolved" as const,
          routability: selection ? "direct_destination" as const : prior?.routability ?? "direct_destination" as const,
          sourceLabel: priorParentWasRemoved ? undefined : prior?.sourceLabel ?? selectedMention?.sourceText,
          parentCountries: selection?.selectedParentCountries ?? prior?.parentCountries ?? (stop.country ? [stop.country] : selectedMention?.parentCountries),
          role: prior?.role ?? "preferred" as const,
          priority: prior?.priority ?? "normal" as const,
        };
      }),
      ...(routeJourneyEnd ? [{
        name: routeJourneyEnd.name,
        canonicalPlaceId: routeJourneyEnd.canonicalPlaceId,
        parentCountries: routeJourneyEnd.country ? [routeJourneyEnd.country] : undefined,
        resolutionStatus: routeJourneyEnd.coordinates ? "resolved" as const : undefined,
        routability: routeJourneyEnd.coordinates ? "direct_destination" as const : undefined,
        role: "departure-gateway" as const,
        priority: "required" as const,
      }] : []),
    ],
    mustVisit: [...new Set([
      ...capturedStructuredBrief.mustVisit.map((destination) => destination.name),
      ...stops.filter((stop) => !effectiveIntent.hardConstraints.optionalStopIds.includes(stop.id)).map((stop) => stop.name),
    ])],
    ...(travellersManuallyEdited ? { travellers: effectiveIntent.travellers } : {}),
    ...(datesManuallyEdited ? { dates: { start: startDate, end: endDate, fixed: effectiveIntent.timing.flexibility === "fixed" } } : {}),
    ...(paceManuallyEdited ? { pace: effectiveIntent.preferences.pace } : {}),
    ...(interestsManuallyEdited ? { interests: effectiveIntent.preferences.interests } : {}),
    ...(transportManuallyEdited ? { transportPreferences: effectiveIntent.preferences.transportModes } : {}),
    ...((budgetPreference?.source !== "cleared" && budgetPreference?.source !== "fallback")
      && (hasSavedTravelProfile || showBudgetOverride) ? { budget } : {}),
    fixedCommitments: projectedFixedCommitments.map(({ id: _id, ...commitment }) => commitment),
    avoidDriving: effectiveIntent.hardConstraints.avoidDriving,
    placeSelections: effectivePlaceSelections,
    completedPlanningAreaMentionIds,
    removedPlaceMentionIds,
  }), [canonicalBuilder, capturedStructuredBrief, totalDays, origin, originCanonicalPlaceId, originCountry, originCoordinates, routeJourneyEnd, stops, effectiveIntent, projectedFixedCommitments, startDate, endDate, budget, budgetPreference, datesManuallyEdited, travellersManuallyEdited, paceManuallyEdited, transportManuallyEdited, interestsManuallyEdited, hasSavedTravelProfile, showBudgetOverride, effectivePlaceSelections, completedPlanningAreaMentionIds, removedPlaceMentionIds]);
  const structuredRouteConstraints = useMemo(() => routeConstraintsFromStructuredTripBrief(effectiveStructuredBrief, stops.map((stop) => stop.id)), [effectiveStructuredBrief, stops]);
  const structuredScoringPreferences = useMemo(() => routeScoringPreferencesFromStructuredBrief(effectiveStructuredBrief), [effectiveStructuredBrief]);
  const intentReady = Boolean(originCoordinates && stops.length && effectiveIntent.travellers >= 1);

  useEffect(() => {
    if (!hydrated || !intentReady) return;
    if (!hasAnalyticsConsent()) return;
    const key = `morrovia:trip-intent-tracked:${tripId}`;
    if (window.localStorage.getItem(key)) return;
    trackEvent("trip_intent_created", {
      traveller_count: effectiveIntent.travellers,
      stop_count: stops.length,
      duration_days: totalDays,
      dates_flexible: effectiveIntent.timing.flexibility === "flexible",
      fixed_commitment_count: effectiveIntent.hardConstraints.fixedCommitments.length,
      avoid_driving: effectiveIntent.hardConstraints.avoidDriving,
    });
    window.localStorage.setItem(key, "1");
  }, [hydrated, intentReady, tripId, effectiveIntent, stops.length, totalDays]);

  useEffect(() => {
    if (!hydrated || !hasRouteSkeleton) return;
    if (!hasAnalyticsConsent()) return;
    const key = `morrovia:budget-viewed:${tripId}`;
    if (window.sessionStorage.getItem(key)) return;
    trackEvent("budget_viewed", { budget_band: budget, stop_count: stops.length, duration_days: totalDays });
    window.sessionStorage.setItem(key, "1");
  }, [budget, hydrated, hasRouteSkeleton, stops.length, totalDays, tripId]);

  // Anchor/base relationships stay in StructuredTripBrief. Selecting a base
  // must not silently manufacture an itinerary activity or transport leg.
  const effectivePicks = useMemo(
    () => Object.fromEntries(Object.entries(picks).map(([stopId, titles]) => [stopId, [...titles]])),
    [picks],
  );
  const selected = stops.flatMap((stop) => (effectivePicks[stop.id] ?? []).map((title) => ({ stopId: stop.id, title })));
  const contextualSuggestions = useMemo(
    () => [...(ROUTE_HINT_SUGGESTIONS[routeHints[0]] ?? []), ...(ROUTE_HINT_SUGGESTIONS[routeHints[1]] ?? []), ...suggestionsFor(stops.at(-1))]
      .map((suggestion) => typeof suggestion === "string"
        ? canonicalPlaceSuggestionFor(suggestion, stops.map((stop) => stop.country))
        : suggestion)
      .filter((suggestion): suggestion is CanonicalPlaceSuggestion => Boolean(suggestion))
      .filter((suggestion, index, all) => all.findIndex((item) => item.canonicalPlaceId === suggestion.canonicalPlaceId) === index
        && !stops.some((stop) => stop.canonicalPlaceId === suggestion.canonicalPlaceId
          || stop.name.toLocaleLowerCase() === suggestion.name.toLocaleLowerCase()))
      .slice(0, 4),
    [routeHints, stops],
  );
  const originMissing = originTouched && (!origin.trim() || Boolean(originError));
  const contextMentionIds = useMemo(() => {
    const ids=geographicContextMentionIds(effectiveStructuredBrief.source.rawPrompt ?? "", effectiveStructuredBrief.placeMentions ?? intakeMentions, journeyStartPlace ? [journeyStartPlace] : []);
    return canonicalBuilder ? preserveAuthoredCountryContextIntents(canonicalBuilder,ids) : ids;
  }, [effectiveStructuredBrief, intakeMentions, journeyStartPlace, canonicalBuilder]);
  const activePlaceMentions = useMemo(() => (effectiveStructuredBrief.placeMentions ?? intakeMentions)
    .filter((mention) => !(effectiveStructuredBrief.removedPlaceMentionIds ?? []).includes(mention.mentionId) && !contextMentionIds.has(mention.mentionId)), [effectiveStructuredBrief, intakeMentions, contextMentionIds]);
  const endpointMentionIds = useMemo(() => new Set(activePlaceMentions.filter(isEndMention).map((mention) => mention.mentionId)), [activePlaceMentions]);
  const placeIssues = (effectiveStructuredBrief.placeIssues ?? []).filter((issue) => !endpointMentionIds.has(issue.mentionId) && !contextMentionIds.has(issue.mentionId));
  const reviewPlaceMentions = useMemo(() => placeMentionsNeedingReview(activePlaceMentions, placeIssues)
    .filter((mention) => !reviewedRouteStopSatisfiesMention({
      mention, brief: effectiveStructuredBrief, stops, sourceRouteKey,
      curatedRoute: currentCuratedRoute, reviewedDraft: reviewedRouteDraft,
    })), [activePlaceMentions, placeIssues, effectiveStructuredBrief, stops, sourceRouteKey, currentCuratedRoute, reviewedRouteDraft]);
  const selectedMentionIds = useMemo(() => new Set(activePlaceMentions.filter((mention) => {
    const hasSelection = (effectiveStructuredBrief.placeSelections ?? []).some((selection) => selection.mentionId === mention.mentionId);
    const needsExplicitCompletion = placeMentionSupportsMultipleSelections(mention)
      || mention.requiresBaseSelection
      || mention.routability === "planning_area"
      || mention.routability === "anchor_or_poi";
    return hasSelection && (!needsExplicitCompletion || completedPlanningAreaMentionIds.includes(mention.mentionId));
  }).map((mention) => mention.mentionId)), [activePlaceMentions, completedPlanningAreaMentionIds, effectiveStructuredBrief.placeSelections]);
  const pendingReviewPlaceMentions = useMemo(() => reviewPlaceMentions.filter((mention) => !selectedMentionIds.has(mention.mentionId)), [reviewPlaceMentions, selectedMentionIds]);
  const geographyReviewPlaceMentions = useMemo(() => pendingReviewPlaceMentions
    .filter((mention) => !(mention.mentionId === transientPlanningMentionId && mention.mentionId === originPlanningMentionId)), [originPlanningMentionId, pendingReviewPlaceMentions, transientPlanningMentionId]);
  const providerClarificationMentionIds = useMemo(() => new Set(locationChoices.map(({ mention }) => mention.mentionId)), [locationChoices]);
  const pendingClarificationIds = useMemo(() => orderedBuilderClarificationIds([
    ...locationChoices.filter(({ mention }) => !reviewedRouteStopSatisfiesMention({
      mention, brief: effectiveStructuredBrief, stops, sourceRouteKey,
      curatedRoute: currentCuratedRoute, reviewedDraft: reviewedRouteDraft,
    })).map(({ mention }) => ({ id: mention.mentionId, order: mention.order })),
    ...geographyReviewPlaceMentions
      .filter((mention) => !providerClarificationMentionIds.has(mention.mentionId))
      .map((mention) => ({ id: mention.mentionId, order: mention.order })),
  ]), [geographyReviewPlaceMentions, locationChoices, providerClarificationMentionIds, effectiveStructuredBrief, stops, sourceRouteKey, currentCuratedRoute, reviewedRouteDraft]);
  const activeClarificationId = clarificationSessionIds[clarificationIndex];
  const activeProviderClarification = activeClarificationId
    ? locationChoices.find(({ mention }) => mention.mentionId === activeClarificationId)
    : undefined;
  const providerClarificationScope = activeProviderClarification && mountedBuilder ? {
    tripId: mountedBuilder.snapshot.trip.id, ownerId: mountedBuilder.snapshot.browserOwnerId,
    revision: mountedBuilder.snapshot.inputRevision, mentionId: activeProviderClarification.mention.mentionId,
  } : null;
  const activeClarificationMention = activeClarificationId
    ? activePlaceMentions.find((mention) => mention.mentionId === activeClarificationId)
    : undefined;
  const activeNearbyBaseAnchor = useMemo(
    () => activeClarificationMention ? nearbyBaseAnchorForMention(activeClarificationMention) : undefined,
    [activeClarificationMention],
  );
  const activeNearbyBaseAnchorKey = JSON.stringify(activeNearbyBaseAnchor ?? null);
  const pendingClarificationNames = pendingClarificationIds.flatMap((mentionId) => {
    const mention = activePlaceMentions.find((item) => item.mentionId === mentionId)
      ?? locationChoices.find((item) => item.mention.mentionId === mentionId)?.mention;
    return mention ? [placeDisplayName(mention)] : [];
  });
  const pendingClarificationLabel = pendingClarificationIds.length === 1
    ? (() => {
      const mention = activePlaceMentions.find(item => item.mentionId === pendingClarificationIds[0])
        ?? locationChoices.find(item => item.mention.mentionId === pendingClarificationIds[0])?.mention;
      return mention ? discoveryPendingDecisionLabel(language, mention.placeType) : builderClarificationResumeLabel(1);
    })()
    : language === "es"
      ? `${pendingClarificationIds.length} áreas pendientes`
      : builderClarificationResumeLabel(pendingClarificationIds.length);

  useEffect(() => {
    if (!clarificationOpen || !activeClarificationMention || !activeNearbyBaseAnchor) {
      if (!activeNearbyBaseAnchor) setNearbyBaseDiscovery(null);
      return;
    }
    const scope = createAbortableEffectScope("nearby base discovery");
    const anchor = activeNearbyBaseAnchor;
    const params = new URLSearchParams({
      nearbyBases: "1",
      anchorName: anchor.canonicalName,
      anchorType: anchor.placeType,
      anchorLon: String(anchor.coordinates![0]),
      anchorLat: String(anchor.coordinates![1]),
    });
    if (anchor.canonicalPlaceId) params.set("anchorId", anchor.canonicalPlaceId);
    anchor.parentCountries.forEach((country) => params.append("anchorCountry", country));
    if (anchor.parentRegionId) params.set("anchorRegion", anchor.parentRegionId);
    if (anchor.accessPlaceName) params.set("anchorAccessPlace", anchor.accessPlaceName);
    setNearbyBaseDiscovery((current) => current?.mentionId === activeClarificationMention.mentionId && current.status === "ready"
      ? current
      : { mentionId: activeClarificationMention.mentionId, status: "loading", suggestions: [] });
    withProviderTimeout({
      label: "Nearby base discovery",
      timeoutMs: 7_000,
      signal: scope.signal,
      request: (signal) => fetch(`/api/journey-geocode?${params}`, { signal }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("nearby base discovery unavailable");
        return response.json() as Promise<{ candidates?: NearbyBaseSuggestion[]; status?: string }>;
      })
      .then((payload) => {
        const suggestions = payload.candidates ?? [];
        scope.commit(() => setNearbyBaseDiscovery({
          mentionId: activeClarificationMention.mentionId,
          status: suggestions.length ? "ready" : "empty",
          suggestions,
        }));
      })
      .catch((error) => {
        if (scope.isCancellation(error)) return;
        scope.commit(() => setNearbyBaseDiscovery({ mentionId: activeClarificationMention.mentionId, status: "unavailable", suggestions: [] }));
      });
    return () => scope.dispose();
  }, [activeClarificationMention?.mentionId, activeNearbyBaseAnchorKey, clarificationOpen, nearbyBaseRetryNonce]);

  useEffect(() => {
    const pending = pendingDiscoveryBase;
    if (!clarificationOpen || !pending || pending.mentionId !== activeClarificationMention?.mentionId) return;
    const anchor = nearbyBaseAnchorForMention({ canonicalPlaceId: pending.area.canonicalPlaceId,
      canonicalName: pending.area.name, placeType: pending.area.placeType, parentCountries: [pending.area.country],
      parentRegionId: pending.area.region, coordinates: pending.area.coordinates, routability: pending.area.routability ?? "needs_base_selection" });
    if (!anchor) { setSearchedAreaBases({ mentionId: pending.mentionId, status: "empty", suggestions: [] }); return; }
    const scope = createAbortableEffectScope("Discovery area base search");
    const params = new URLSearchParams({ nearbyBases: "1", anchorName: anchor.canonicalName,
      anchorType: anchor.placeType, anchorLon: String(anchor.coordinates![0]), anchorLat: String(anchor.coordinates![1]),
      anchorId: anchor.canonicalPlaceId ?? "" });
    anchor.parentCountries.forEach(country => params.append("anchorCountry", country));
    if (anchor.parentRegionId) params.set("anchorRegion", anchor.parentRegionId);
    setSearchedAreaBases({ mentionId: pending.mentionId, status: "loading", suggestions: [] });
    withProviderTimeout({ label: "Discovery area bases", timeoutMs: 7_000, signal: scope.signal,
      request: signal => fetch(`/api/journey-geocode?${params}`, { signal }) })
      .then(async response => {
        if (!response.ok) throw new Error("Discovery area bases unavailable");
        return response.json() as Promise<{ candidates?: NearbyBaseSuggestion[] }>;
      })
      .then(payload => scope.commit(() => {
        const suggestions = (payload.candidates ?? []).filter(candidate => discoveryBaseForSearchedArea(pending.area, candidate));
        setSearchedAreaBases({ mentionId: pending.mentionId, status: suggestions.length ? "ready" : "empty", suggestions });
      }))
      .catch(error => { if (!scope.isCancellation(error)) scope.commit(() =>
        setSearchedAreaBases({ mentionId: pending.mentionId, status: "unavailable", suggestions: [] })); });
    return () => scope.dispose();
  }, [activeClarificationMention?.mentionId, clarificationOpen, pendingDiscoveryBase]);

  useEffect(() => {
    const scope = `${activeBrowserOwnerId ?? "guest"}:${tripId}`;
    if (clarificationScopeRef.current === undefined) {
      clarificationScopeRef.current = scope;
      return;
    }
    if (clarificationScopeRef.current === scope) return;
    clarificationScopeRef.current = scope;
    setClarificationOpen(false);
    setClarificationSessionIds([]);
    setClarificationIndex(0);
    setClarificationAutoOpened(false);
    setClarificationDismissed(false);
    setNearbyBaseDiscovery(null);
    setExpandedNearbyBaseMentionIds([]);
  }, [activeBrowserOwnerId, tripId]);

  useEffect(() => {
    if (!hydrated || typeof document === "undefined") return;
    const requestedPlaceIntentId = requestedPlaceIntentRef.current;
    const hasRequestedPlaceIntent = Boolean(requestedPlaceIntentId
      && pendingClarificationIds.includes(requestedPlaceIntentId));
    const competingModal = Boolean(document.querySelector(
      '[role="dialog"]:not([data-builder-clarification-ui="true"]), [data-product-tour-prompt="true"]',
    ));
    if (!shouldAutoOpenBuilderClarification({
      hydrated,
      placesStep: true,
      arrivedFromHomepage: arrivedFromHomepage || hasRequestedPlaceIntent || resumedQuerylessDraft,
      resolving: resolvingLocations,
      itemCount: pendingClarificationIds.length,
      alreadyOpened: clarificationAutoOpened,
      explicitlyDismissed: clarificationDismissed,
      competingModal: competingModal || productTourOpen,
      recoveryBlocked: Boolean(cloudSaveError || cloudConflictTrip || deviceRecoveryBlocked || deviceStorageBlocked || pendingStopRemoval || pendingTopType || pendingTopRemoval || savedFinishReview),
    })) return;
    const requestedIndex = requestedPlaceIntentId
      ? pendingClarificationIds.indexOf(requestedPlaceIntentId)
      : -1;
    setClarificationSessionIds(pendingClarificationIds);
    setClarificationIndex(Math.max(0, requestedIndex));
    requestedPlaceIntentRef.current = null;
    setClarificationAutoOpened(true);
    setClarificationOpen(true);
  }, [arrivedFromHomepage, clarificationAutoOpened, clarificationDismissed, cloudConflictTrip, cloudSaveError, deviceRecoveryBlocked, deviceStorageBlocked, hydrated, pendingClarificationIds, pendingStopRemoval, pendingTopType, pendingTopRemoval, savedFinishReview, productTourOpen, resolvingLocations, resumedQuerylessDraft]);

  useEffect(() => {
    if (clarificationOpen || !restoreClarificationResumeFocusRef.current) return;
    restoreClarificationResumeFocusRef.current = false;
    window.requestAnimationFrame(() => clarificationResumeRef.current?.focus());
  }, [clarificationOpen]);

  useEffect(() => {
    if (!clarificationOpen) return;
    const clarificationMustYield = shouldYieldBuilderClarification({
      discoveryDraftOpen: Boolean(activeClarificationMention
        && capturedStructuredBrief.discoveryDraftByMentionId?.[activeClarificationMention.mentionId]?.version === 1),
      saveBlocked: Boolean(cloudSaveError || deviceRecoveryBlocked || deviceStorageBlocked),
      competingModal: Boolean(productTourOpen || cloudConflictTrip || pendingStopRemoval || pendingTopType || pendingTopRemoval || optimizationProposal || savedFinishReview),
    });
    if (!clarificationMustYield) return;
    setClarificationDismissed(true);
    setClarificationOpen(false);
  }, [activeClarificationMention, capturedStructuredBrief.discoveryDraftByMentionId, clarificationOpen, cloudConflictTrip, cloudSaveError, deviceRecoveryBlocked, deviceStorageBlocked, pendingStopRemoval, pendingTopType, pendingTopRemoval, savedFinishReview, productTourOpen, optimizationProposal]);

  // Correct only proven untouched capture-context intents through the normal
  // revision/owner-scoped queue. Hydration/reads never rewrite saved documents.
  useEffect(() => {
    if (!hydrated || sessionPending || !browserContextReady || cloudSaveError || cloudConflictTrip
      || deviceRecoveryBlocked || deviceStorageBlocked || (clarificationOpen && activeClarificationMention)
      || pendingStopRemoval || pendingTopType || pendingTopRemoval || savedFinishReview || optimizationProposal
      || resolvingLocations || productTourOpen) return;
    const snapshot=builderEditSessionRef.current?.getSnapshot();
    if(!snapshot || snapshot.browserOwnerId!==activeBrowserOwnerIdRef.current
      || !canUseHydratedTripScope(hydratedOwnerScopeRef.current,snapshot.browserOwnerId))return;
    const ids=eligibleCountryContextIntentIds(snapshot.trip).filter(id=>!snapshot.draft.fields.some(field=>
      (field.binding.kind==="destination"||field.binding.kind==="nights")&&field.binding.intentId===id));
    if(ids.length && dispatchAcceptedBuilderEdit({kind:"planning-context",mentionIds:ids},{expectedInputRevision:snapshot.inputRevision}) && clarificationOpen) {
      // Context proof can hide the last country dialog before its accepted
      // correction. Close only that already absent dialog; active review waits.
      setClarificationOpen(false);
    }
  }, [hydrated, sessionPending, browserContextReady, mountedBuilder, cloudSaveError, cloudConflictTrip,
    deviceRecoveryBlocked, deviceStorageBlocked, clarificationOpen, activeClarificationMention, pendingStopRemoval,
    pendingTopType, pendingTopRemoval, savedFinishReview, optimizationProposal, resolvingLocations, productTourOpen]);


  const openClarificationSession = (preferredMentionId?: string) => {
    const trip=builderEditSessionRef.current?.getSnapshot().trip;
    const targeted=preferredMentionId&&trip?.brief.intent.route.destinations.find(item=>item.id===preferredMentionId);
    const ids=targeted&&activePlaceMentions.some(mention=>mention.mentionId===preferredMentionId)
      &&!pendingClarificationIds.includes(preferredMentionId!)?[preferredMentionId!,...pendingClarificationIds]:pendingClarificationIds;
    if(!ids.length)return;
    const intent=trip?.brief.intent.route.destinations.find(item=>item.id===(preferredMentionId??ids[0]));
    const stop=intent?.kind==='overnight_place'&&intent.stopIds.length===1
      ?trip?.stops.find(item=>item.id===intent.stopIds[0]):undefined;
    // A canonical city can still await geographic confirmation. Discovery
    // skips cities already in the route, so use the saved occurrence chooser.
    if(stop&&!geographicallyReady(stopGeographicPlace(stop))){void confirmSavedLocation(stop.id);return;}
    setClarificationSessionIds(ids);
    setClarificationIndex(Math.max(0, preferredMentionId ? ids.indexOf(preferredMentionId) : 0));
    setClarificationAutoOpened(true);
    setClarificationDismissed(false);
    setClarificationOpen(true);
  };

  const dismissClarificationSession = () => {
    restoreClarificationResumeFocusRef.current = true;
    setClarificationDismissed(true);
    setClarificationOpen(false);
  };

  const advanceClarificationSession = () => {
    if (clarificationIndex < clarificationSessionIds.length - 1) {
      setClarificationIndex((current) => current + 1);
      return;
    }
    setClarificationOpen(false);
    setClarificationSessionIds([]);
    setClarificationIndex(0);
  };
  const inlineStopPlanningMention = resolvingPlaceMentionId
    ? activePlaceMentions.find((mention) => mention.mentionId === resolvingPlaceMentionId)
    : undefined;
  const inlineStopBaseMention = inlineStopPlanningMention && (inlineStopPlanningMention.requiresBaseSelection
    || inlineStopPlanningMention.routability === "planning_area"
    || inlineStopPlanningMention.routability === "anchor_or_poi")
    ? inlineStopPlanningMention
    : undefined;
  const inlineOriginPlanningMention = originPlanningMentionId
    ? activePlaceMentions.find((mention) => mention.mentionId === originPlanningMentionId)
    : undefined;
  const attractionVisitProposals = useMemo(() => new Map(pendingReviewPlaceMentions.flatMap((mention) => {
    const ranked = rankAttractionVisitTargets(mention, stops.map((stop) => ({
      routeStopId: stop.id,
      name: stop.name,
      canonicalPlaceId: stop.canonicalPlaceId,
      country: stop.country,
      coordinates: stop.coordinates,
    })));
    const best = ranked[0];
    const next = ranked[1];
    return best?.confidence.level === "medium" && (!next || best.score - next.score >= 15)
      ? [[mention.mentionId, best] as const]
      : [];
  })), [pendingReviewPlaceMentions, stops]);
  const allResolvedPlaceMentions = useMemo(() => activePlaceMentions.filter((mention) => selectedMentionIds.has(mention.mentionId)), [activePlaceMentions, selectedMentionIds]);
  const resolvedPlanningAreaMentions = useMemo(() => allResolvedPlaceMentions.filter(placeMentionSupportsMultipleSelections), [allResolvedPlaceMentions]);
  const resolvedPlaceMentions = useMemo(() => allResolvedPlaceMentions.filter((mention) => !placeMentionSupportsMultipleSelections(mention)), [allResolvedPlaceMentions]);
  const contextualResolvedPlaceMentions = useMemo(() => resolvedPlaceMentions.filter((mention) => {
    const selections = effectiveStructuredBrief.placeSelections?.filter((item) => item.mentionId === mention.mentionId) ?? [];
    if (selections.length !== 1) return selections.length > 1;
    const requested = placeDisplayName(mention).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
    const selected = selections[0].selectedName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
    return requested !== selected;
  }), [effectiveStructuredBrief.placeSelections, resolvedPlaceMentions]);
  const hardBlockingPlaceIssue = placeIssues.find((issue) => issue.blocksRoute
    && !selectedMentionIds.has(issue.mentionId)
    && !placeIssueNeedsAttention(issue));
  const pendingPlaceCount = new Set(placeIssues.filter((issue) => issue.blocksRoute && !selectedMentionIds.has(issue.mentionId)).map((issue) => issue.mentionId)).size;
  const stopSectionEditing = showStopEditor || Boolean(inlineStopBaseMention) || pendingPlaceCount > 0;
  const stopSectionVisible = stopSectionEditing || stops.length > 0;
  const areasToShapeCount = pendingReviewPlaceMentions.filter((mention) => mention.status !== "ambiguous" && mention.status !== "unresolved"
    && (mention.requiresBaseSelection || mention.routability === "planning_area" || mention.routability === "anchor_or_poi")).length;
  const identitiesToConfirmCount = pendingReviewPlaceMentions.filter((mention) => mention.status === "ambiguous" || mention.status === "unresolved").length;
  const placeReviewReady = !resolvingLocations && !hardBlockingPlaceIssue;
  const pickedUpPreferences = useMemo(() => {
    const labels: string[] = [];
    if (effectiveStructuredBrief.duration) labels.push(`${effectiveStructuredBrief.duration.value} ${effectiveStructuredBrief.duration.unit}`);
    const capturedModes = effectiveStructuredBrief.transportPreferences.map((preference) => preference.value);
    if (capturedModes.includes("train")) labels.push(language === "es" ? "Tren preferido" : "Train preferred");
    if (capturedModes.includes("flight")) labels.push(language === "es" ? "Volar cuando convenga" : "Fly when it helps");
    if (capturedModes.includes("ground")) labels.push(language === "es" ? "Por tierra cuando sea práctico" : "Overland where practical");
    const capturedPace = effectiveStructuredBrief.pace?.value;
    if (capturedPace && capturedPace !== "balanced") labels.push(language === "es" ? ({ relaxed: "Ritmo tranquilo", packed: "Ritmo intenso" }[capturedPace]) : ({ relaxed: "Relaxed pace", packed: "Full days" }[capturedPace]));
    if (effectiveStructuredBrief.hardConstraints.some((constraint) => constraint.type === "no-driving")) labels.push(language === "es" ? "Evitar coche" : "Avoid driving");
    effectiveIntent.preferences.interests.forEach((interest) => labels.push(tripInterestLabels[language][interest]));
    return labels;
  }, [effectiveIntent.preferences.interests, effectiveStructuredBrief, language]);
  const openSummaryEditor = (target: "origin" | "stops" | "dates" | "constraints") => {
    if (target === "stops") setShowStopEditor(true);
    if (target === "constraints") setShowTripDetails(true);
    setSummaryFocus(target);
    window.setTimeout(() => document.getElementById(`builder-${target}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };

  const routeIntelligenceInput: Parameters<typeof assessRouteIntelligence>[0] = {
    origin: { name: origin.trim(), coordinates: canonicalBuilder?validatedPlaceCoordinates(canonicalBuilder.brief.intent.route.origin,'endpoint')??undefined:originCoordinates },
    end: routeJourneyEnd && canonicalBuilder ? { ...routeJourneyEnd,
      coordinates: validatedPlaceCoordinates(resolvedJourneyEndPlace(journeyStartPlace, journeyEnd), 'endpoint') ?? undefined } : routeJourneyEnd,
    stops:canonicalBuilder?stops.map(stop=>({...stop,coordinates:validatedPlaceCoordinates(stop)??undefined})):stops,
    picks: effectivePicks,
    availableDays: totalDays,
    constraints: {
      ...structuredRouteConstraints,
      fixedCommitments: projectedFixedCommitments,
      transportModes: structuredRouteConstraints.transportModes.length ? structuredRouteConstraints.transportModes : effectiveIntent.preferences.transportModes,
      optionalStopIds: effectiveIntent.hardConstraints.optionalStopIds,
    },
    scoringPreferences: {
      pace: structuredScoringPreferences.pace ?? effectiveIntent.preferences.pace,
      preferredModes: structuredScoringPreferences.preferredModes.length
        ? structuredScoringPreferences.preferredModes
        : effectiveIntent.preferences.transportModes.map((mode) => mode === "drive" ? "road" as const : mode),
      avoidFlights: structuredScoringPreferences.avoidFlights,
      interests: effectiveIntent.preferences.interests,
    },
  };
  // Discovery drafts and save receipts do not change the route assessment.
  // Compare its complete semantic input rather than document object identity.
  const routeIntelligence = useMemo(() => assessRouteIntelligence(routeIntelligenceInput), [JSON.stringify(routeIntelligenceInput)]);
  const routeKey = stops.map((stop) => stop.id).join("|");
  const routeRecommendationVisible = routeIntelligence.route.state === "recommendation" && keptRouteKey !== routeKey;
  const currentRouteCheckProposalStopIds = currentBuilderRouteProposal(
    routeCheckProposalStopIds,
    routeIntelligence.route.recommendedStopIds,
    routeRecommendationVisible,
  );
  useEffect(() => {
    if (routeCheckProposalStopIds && !currentRouteCheckProposalStopIds) {
      setRouteCheckProposalStopIds(null);
    }
  }, [currentRouteCheckProposalStopIds, routeCheckProposalStopIds]);
  const routeAnalyticsKey = `${tripId}:${routeKey}:${startDate}:${endDate}:${effectiveIntent.hardConstraints.fixedCommitments.length}:${effectiveIntent.hardConstraints.avoidDriving}`;
  useEffect(() => {
    if (!hydrated || routeIntelligence.route.state === "insufficient-data") return;
    if (!hasAnalyticsConsent()) return;
    const key = `morrovia:route-generated:${routeAnalyticsKey}`;
    if (window.localStorage.getItem(key)) return;
    trackEvent("route_generated", {
      stop_count: stops.length,
      duration_days: totalDays,
      has_recommendation: routeIntelligence.route.state === "recommendation",
      shortfall_days: routeIntelligence.shortfallDays,
      has_fixed_commitments: effectiveIntent.hardConstraints.fixedCommitments.length > 0,
    });
    window.localStorage.setItem(key, "1");
  }, [hydrated, routeAnalyticsKey, routeIntelligence, stops.length, totalDays, effectiveIntent.hardConstraints.fixedCommitments.length]);
  const routeCopy = language === "es" ? {
    eyebrow: "COMPROBACIÓN DE RUTA", useOrder: "Usar este orden", keepOrder: "Mantener mi orden",
    currentOrder: "Tu ruta ya tiene un buen flujo.", cleanerOrder: "es el orden más directo.",
    removesTravel: (minutes: number) => `Ahorra aproximadamente ${Math.floor(minutes / 60)} h ${minutes % 60} min de tiempo de traslado estimado.`,
    direction: "Evita retrocesos innecesarios.", heavyArrival: "El traslado de llegada ocupa gran parte del día.",
    substantialArrival: "El traslado de llegada ocupa una parte importante del día.", landmark: "Reserva un día completo para este lugar emblemático.",
    selectedPlaces: (count: number) => `${count} lugares seleccionados necesitan más que un día apresurado.`,
    lightArrival: "Deja tiempo para llegar y empezar a conocer el lugar.", usable: (days: number) => `aprox. ${days} días aprovechables`,
    shortfall: (comfortable: number) => `${comfortable} días sería un ritmo más cómodo`,
    shortfallHelp: "Ajusta el tiempo, elimina una parada o acepta que algunos días serán más intensos.",
  } : {
    eyebrow: "ROUTE CHECK", useOrder: "Use this order", keepOrder: "Keep my order",
    currentOrder: "Your route already flows well.", cleanerOrder: "is the cleaner order.",
    removesTravel: (minutes: number) => `It removes about ${Math.floor(minutes / 60)}h ${minutes % 60}m of estimated transfer time.`,
    direction: "It avoids unnecessary backtracking.", heavyArrival: "The arrival transfer takes most of the day.",
    substantialArrival: "The arrival transfer uses a meaningful part of the day.", landmark: "Keep a full day protected for this landmark.",
    selectedPlaces: (count: number) => `${count} selected places need more than a rushed day.`,
    lightArrival: "It leaves time to arrive and start experiencing the place.", usable: (days: number) => `about ${days} usable days`,
    shortfall: (comfortable: number) => `${comfortable} days would feel more comfortable`,
    shortfallHelp: "Adjust the time, remove a stop, or accept that some days will be more intensive.",
  };
  const routeTransferSaving = routeTransferSavingMinutes(routeIntelligence.route);

  /** Existing duration guidance remains the fallback when destination knowledge is unavailable. */
  const recommendedNights = useMemo(() => {
    return Object.fromEntries(stops.map((stop) => [stop.id, routeIntelligence.durations[stop.id]?.recommendedDays ?? 1])) as Record<string, number>;
  }, [stops, routeIntelligence.durations]);
  const minimumNights = useMemo(() => {
    return Object.fromEntries(stops.map((stop) => [stop.id, routeIntelligence.durations[stop.id]?.minimumDays ?? 1])) as Record<string, number>;
  }, [stops, routeIntelligence.durations]);
  const baselineBuilderCanonicalLegs = useMemo(() => buildCanonicalTripLegs({
    tripId,
    origin: {
      name: origin,
      country: originCountry,
      canonicalPlaceId: originCanonicalPlaceId,
      providerId: originProviderId,
      ...(journeyOrigin.geographicBinding===undefined?{}:{geographicBinding:journeyOrigin.geographicBinding}),
      coordinates: originCoordinates ?? null,
    },
    journeyEnd,
    stops: stops.map((stop, order) => ({
      id: stop.id,
      order,
      name: stop.name,
      country: stop.country,
      canonicalPlaceId: stop.canonicalPlaceId,
      providerId: stop.providerId,
      ...(stop.geographicBinding===undefined?{}:{geographicBinding:stop.geographicBinding}),
      latitude: stop.coordinates?.[1] ?? null,
      longitude: stop.coordinates?.[0] ?? null,
      arrivalDate: null,
      departureDate: null,
      nights: 0,
    } satisfies TripStop)),
    constraints: structuredRouteConstraints,
    curatedRoute: currentCuratedRoute,
  }), [tripId, journeyOrigin, origin, originCountry, originCanonicalPlaceId, originProviderId, originCoordinates, journeyEnd, stops, structuredRouteConstraints, currentCuratedRoute]);
  const transferResolutionKey = useMemo(() => JSON.stringify(baselineBuilderCanonicalLegs.map((leg) => ({
    id: leg.id,
    mode: leg.mode,
    durationMinutes: leg.durationMinutes,
    from: leg.fromEndpoint,
    to: leg.toEndpoint,
    source: leg.routeMetadata.source,
    roadFallbackEligible: leg.routeMetadata.roadFallbackEligible,
    gatewayResolutionRequired: leg.routeMetadata.gatewayResolutionRequired,
  }))), [baselineBuilderCanonicalLegs]);
  const [resolvedBuilderLegs, setResolvedBuilderLegs] = useState<{ key: string; legs: TripLeg[] } | null>(null);
  useEffect(() => {
    if (canonicalBuilder) return;
    const hasCandidate = baselineBuilderCanonicalLegs.some((leg) => leg.routeMetadata.source === "morrovia-planner"
      || leg.routeMetadata.source === "road-routing-provider");
    if (!hasCandidate) {
      setResolvedBuilderLegs(null);
      return;
    }
    const controller = new AbortController();
    void fetch("/api/journey-transfer-resolution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({ legs: baselineBuilderCanonicalLegs }),
    }).then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json() as { legs?: TripLeg[] };
      return Array.isArray(payload.legs) && payload.legs.length === baselineBuilderCanonicalLegs.length ? payload.legs : null;
    }).then((legs) => {
      if (legs && !controller.signal.aborted) setResolvedBuilderLegs({ key: transferResolutionKey, legs });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [canonicalBuilder, baselineBuilderCanonicalLegs, transferResolutionKey]);
  const builderCanonicalLegs = useMemo(() => canonicalBuilder ? canonicalBuilder.legs : resolvedBuilderLegs?.key === transferResolutionKey
    ? resolvedBuilderLegs.legs
    : baselineBuilderCanonicalLegs.map((leg) => leg.routeMetadata.gatewayResolutionRequired === true ? {
        ...leg,
        mode: "unknown" as const,
        durationMinutes: null,
        headlineMinutes: null,
        doorToDoorMinutes: null,
        usableDayLoss: null,
        provider: "Resolving the gateway and onward transfer.",
        provenance: "unknown" as const,
        confidence: "unknown" as const,
        scheduleNeedsChecking: true,
      } : leg), [canonicalBuilder, baselineBuilderCanonicalLegs, resolvedBuilderLegs, transferResolutionKey]);
  const nightAllocationStops = useMemo<NightAllocationStopInput[]>(() => {
    const required = new Set([
      ...(structuredRouteConstraints.requiredStopIds ?? []),
      ...effectiveIntent.hardConstraints.mustSeeStopIds,
    ]);
    return stops.map((stop) => {
      const briefDestination = effectiveStructuredBrief.destinations.find((destination) => destination.id === stop.id
        || destination.name.toLocaleLowerCase() === stop.name.toLocaleLowerCase());
      const arrivalImpact = transferImpactFromMetadata(builderCanonicalLegs.find((leg) => leg.toStopId === stop.id)?.routeMetadata.transferImpact);
      const departureImpact = transferImpactFromMetadata(builderCanonicalLegs.find((leg) => leg.fromStopId === stop.id)?.routeMetadata.transferImpact);
      const isLocked = scheduleLocks.stopIds.includes(stop.id) || Boolean(scheduleLocks.arrivalDates[stop.id]);
      const currentNights = dayAllocations[stop.id];
      const curatedStop = curatedStopFor(currentCuratedRoute, stop.id);
      const routeStartingNights = sourceRouteKey && currentNights !== undefined ? currentNights : undefined;
      return {
        ...stop,
        required: required.has(stop.id),
        optional: effectiveIntent.hardConstraints.optionalStopIds.includes(stop.id),
        anchor: briefDestination?.role === "trip-anchor" || briefDestination?.role === "must-visit",
        gateway: structuredRouteConstraints.fixedStartStopId === stop.id || structuredRouteConstraints.fixedEndStopId === stop.id,
        fixedNights: isLocked && currentNights !== undefined ? currentNights : undefined,
        manualNights: manualNightStopIds.includes(stop.id) && currentNights !== undefined ? currentNights : undefined,
        fallbackMinimumNights: curatedStop?.minimumNights ?? routeStartingNights ?? minimumNights[stop.id],
        fallbackIdealNights: curatedStop?.recommendedNights ?? routeStartingNights ?? recommendedNights[stop.id],
        preferenceWeight: effectivePicks[stop.id]?.length ?? 0,
        arrivalImpact: arrivalImpact ?? undefined,
        departureImpact: departureImpact ?? undefined,
      };
    });
  }, [stops, structuredRouteConstraints, effectiveIntent, effectiveStructuredBrief.destinations, builderCanonicalLegs, scheduleLocks, dayAllocations, manualNightStopIds, minimumNights, recommendedNights, effectivePicks, sourceRouteKey, currentCuratedRoute]);
  const fixedAllocationCommitments = useMemo(() => projectedFixedCommitments.map((commitment) => ({
    label: commitment.label,
    date: commitment.date,
    stopId: commitment.stopId,
    fixedNights: commitment.fixedNights,
  })), [projectedFixedCommitments]);
  const manualNightRebalance = useMemo(() => manualNightStopIds.length ? rebalanceTripNights({
    totalNights,
    stops: nightAllocationStops,
    pace: effectiveIntent.preferences.pace,
    interests: effectiveIntent.preferences.interests,
    fixedCommitments: fixedAllocationCommitments,
    knowledge: sourceRouteKey ? routeHandoffNightKnowledge : undefined,
    currentAllocations: dayAllocations,
    manualStopIds: manualNightStopIds,
  }) : null, [totalNights, nightAllocationStops, effectiveIntent.preferences.pace, effectiveIntent.preferences.interests, fixedAllocationCommitments, sourceRouteKey, dayAllocations, manualNightStopIds]);
  const nightAllocation = useMemo(() => canonicalBuilder?.brief.nightAllocation ?? manualNightRebalance?.nightAllocation ?? allocateTripNights({
    totalNights,
    stops: nightAllocationStops,
    pace: effectiveIntent.preferences.pace,
    interests: effectiveIntent.preferences.interests,
    fixedCommitments: fixedAllocationCommitments,
    knowledge: sourceRouteKey ? routeHandoffNightKnowledge : undefined,
  }), [canonicalBuilder, manualNightRebalance, totalNights, nightAllocationStops, effectiveIntent.preferences.pace, effectiveIntent.preferences.interests, fixedAllocationCommitments, sourceRouteKey]);
  const allocation = useMemo(() => canonicalBuilder ? (canonicalBuilder.brief.nightAllocations ?? Object.fromEntries(canonicalBuilder.stops.map(stop=>[stop.id,stop.nights??0]))) : nightAllocation.allocations ?? Object.fromEntries(stops.map((stop) => [
    stop.id,
    Math.max(0, Math.round(dayAllocations[stop.id] ?? recommendedNights[stop.id] ?? 0)),
  ])), [canonicalBuilder, nightAllocation, stops, dayAllocations, recommendedNights]);
  useEffect(() => {
    if (canonicalBuilder || builderSeed || hydratedCanonicalTripRef.current?.id === tripId || !manualNightRebalance) return;
    if (manualNightRebalance.manualStopIds.join("\u001f") !== manualNightStopIds.join("\u001f")) {
      setManualNightStopIds(manualNightRebalance.manualStopIds);
    }
    const next = manualNightRebalance.nightAllocation.allocations;
    if (next && stops.some((stop) => (dayAllocations[stop.id] ?? 0) !== (next[stop.id] ?? 0))) {
      setDayAllocations(next);
    }
    const feedback = nightRebalanceFeedback(manualNightRebalance, language);
    if (feedback) setNightEditFeedback(feedback);
  }, [canonicalBuilder, builderSeed, tripId, manualNightRebalance, manualNightStopIds, dayAllocations, stops, language]);
  const calendarDayAllocations = useMemo(
    () => calendarDayAllocationsFromNights(stops.map((stop) => stop.id), allocation),
    [stops, allocation],
  );
  const compressedStops = stops.flatMap((stop) => {
    const duration = routeIntelligence.durations[stop.id];
    const days = allocation[stop.id] ?? 0;
    const arrivalLoad = canonicalArrivalLoad(builderCanonicalLegs.find((leg) => leg.toStopId === stop.id));
    const usableDays = arrivalLoad === "unknown" ? null : usableStopDays(days, arrivalLoad);
    return duration && (days < duration.minimumDays || (usableDays !== null && usableDays < 1))
      ? [{ stop, duration, days, usableDays }]
      : [];
  });
  const longTransferCount = builderCanonicalLegs.filter((leg) => canonicalArrivalLoad(leg) === "travel-heavy").length;
  const oneNightStopCount = stops.filter((stop) => (allocation[stop.id] ?? 0) <= 1).length;
  const unknownTransferCount = builderCanonicalLegs.filter((leg) => leg.mode === "unknown" || leg.durationMinutes === null).length;
  const highlyCompressedTrip = stops.length >= 4 && (
    totalDays <= stops.length + 1
    || oneNightStopCount >= Math.max(3, Math.ceil(stops.length / 2))
    || compressedStops.length >= Math.max(3, Math.ceil(stops.length / 2))
  );
  const allocatedNights = Object.values(allocation).reduce((sum, nights) => sum + nights, 0);
  const allNightsAllocated = stops.length > 0 && allocatedNights === totalNights
    && (canonicalBuilder ? allRequiredStaysHaveNights(canonicalBuilder) : stops.every(stop => (allocation[stop.id] ?? 0) > 0));
  const travelConsequenceIssues = stops.flatMap((stop) => {
    const duration = routeIntelligence.durations[stop.id];
    const arrivalLoad = canonicalArrivalLoad(builderCanonicalLegs.find((leg) => leg.toStopId === stop.id));
    const days = allocation[stop.id] ?? 0;
    const usableDays = arrivalLoad === "unknown" ? null : usableStopDays(days, arrivalLoad);
    const consequence = travelStayConsequence({
      transferMinutes: duration?.arrivalMinutes ?? null,
      usableDays,
      rushed: Boolean(duration && days < duration.minimumDays),
    });
    return duration && consequence.level !== "none" ? [{ stop, duration, days, usableDays, consequence }] : [];
  });
  const longJourneyIssue = [...travelConsequenceIssues].sort((left, right) => (
    Number(right.consequence.level === "strong") - Number(left.consequence.level === "strong")
    || right.consequence.travelShare - left.consequence.travelShare
  ))[0];
  const tripTimingNotice = nightAllocation.state === "conflict"
    ? nightAllocation.conflicts[0]?.message ?? "The fixed stays cannot be reconciled with the trip dates."
    : nightAllocation.state === "compromised"
      ? nightAllocation.conflicts[0]?.message ?? "Some destination minimums cannot fit inside the available nights."
      : routeIntelligence.shortfallDays > 0
    ? (language === "es" ? `Este viaje está comprimido: ${routeIntelligence.comfortableDays} días serían un ritmo más cómodo.` : `This trip is compressed: ${routeIntelligence.comfortableDays} days would feel more comfortable.`)
    : travelConsequenceIssues.length >= 2
      ? (language === "es" ? `${travelConsequenceIssues.length} traslados reducen de forma importante el tiempo en sus destinos.` : `${travelConsequenceIssues.length} transfers materially reduce time at their destinations.`)
      : null;
  const currentOrderKey = stops.map((stop) => stop.id).join("\u001f");
  const currentRouteScore = routeIntelligence.route.scoring?.rankedCandidates.find((candidate) => (
    candidate.state === "scored" && candidate.stopIds.join("\u001f") === currentOrderKey
  ));
  const canonicalTimingComplete = builderCanonicalLegs.every((leg) => canonicalArrivalLoad(leg) !== "unknown");
  const backtrackingPenaltyCount = currentRouteScore?.state === "scored"
    ? currentRouteScore.penalties.filter((penalty) => penalty.code === "unnecessary-backtracking").length
    : null;
  const currentAvoidableCountryReentryCount = currentRouteScore?.state === "scored"
    ? currentRouteScore.metrics.observedAvoidableCountryReentryCount
    : null;
  const recommendedOrderKey = routeIntelligence.route.recommendedStopIds.join("\u001f");
  const recommendedRouteScore = routeIntelligence.route.scoring?.rankedCandidates.find((candidate) => (
    candidate.state === "scored" && candidate.stopIds.join("\u001f") === recommendedOrderKey
  ));
  const recommendedBacktrackingPenaltyCount = recommendedRouteScore?.state === "scored"
    ? recommendedRouteScore.penalties.filter((penalty) => penalty.code === "unnecessary-backtracking").length
    : null;
  const recommendedAvoidableCountryReentryCount = recommendedRouteScore?.state === "scored"
    ? recommendedRouteScore.metrics.observedAvoidableCountryReentryCount
    : null;
  const scoredAlternativeRoutes = (routeIntelligence.route.scoring?.rankedCandidates ?? []).flatMap((score) => {
    if (!canonicalTimingComplete) return [];
    if (score.state !== "scored" || score.stopIds.join("\u001f") === currentOrderKey || !currentRouteScore || currentRouteScore.state !== "scored") return [];
    if (scheduleLocks.stopIds.length || Object.keys(scheduleLocks.arrivalDates).length || structuredRouteConstraints.fixedCommitments?.length) return [];
    const candidate = routeIntelligence.route.candidates?.find((item) => item.metadata.candidateIndex === score.candidateIndex);
    if (!candidate?.constraintsSatisfied || candidate.stops.length !== stops.length) return [];
    const usableDayGain = currentRouteScore.metrics.estimatedTravelDays !== null && score.metrics.estimatedTravelDays !== null
      ? Math.max(0, currentRouteScore.metrics.estimatedTravelDays - score.metrics.estimatedTravelDays)
      : 0;
    const transferMinuteGain = currentRouteScore.metrics.transferMinutes !== null && score.metrics.transferMinutes !== null
      ? Math.max(0, currentRouteScore.metrics.transferMinutes - score.metrics.transferMinutes)
      : 0;
    if (usableDayGain <= 0 && transferMinuteGain < 30) return [];
    return [{
      candidateIndex: score.candidateIndex,
      rank: score.rank,
      stopIds: score.stopIds,
      names: candidate.stops.map((stop) => stop.name),
      usableDayGain,
      transferMinuteGain,
    }];
  }).sort((left, right) => left.rank - right.rank).slice(0, 2);
  const routeAllocation = routeNightDraft ?? allocation;
  const routeNights = stops.reduce((total, stop) => total + (routeAllocation[stop.id] ?? 0), 0);
  const routeNightDifference = routeNights - totalNights;

  const rememberStructuralChange = (summary: string, affectedStopCount: number) => {
    setStructuralNoticeVersion(version => version + 1);
    setLastStructuralChange({ ...(builderEditSessionRef.current ? { canonical: builderEditSessionRef.current.captureStructuralSnapshot() } : {}), stops, allocations: dayAllocations, manualNightStopIds, startDate, endDate, locks: scheduleLocks, placeSelections, completedPlanningAreaMentionIds, removedPlaceMentionIds, countryDiscoveryChoices: capturedStructuredBrief.countryDiscoveryChoices, discoveryDraftByMentionId: capturedStructuredBrief.discoveryDraftByMentionId, capturedPlaceSelections: capturedStructuredBrief.placeSelections, capturedDestinations: capturedStructuredBrief.destinations, capturedMustVisit: capturedStructuredBrief.mustVisit, summary });
    trackEvent("trip_refined", { change_type: summary, affected_stop_count: affectedStopCount });
  };

  const undoStructuralChange = () => {
    if (!lastStructuralChange) return;
    if (builderEditSessionRef.current) {
      if (lastStructuralChange.canonical && dispatchAcceptedBuilderEdit({ kind: "structural-inverse", snapshot: lastStructuralChange.canonical, restoreDates: lastStructuralChange.summary === "change_trip_dates" })) {
        setNightEditFeedback(null); setLastStructuralChange(null);
      }
      return;
    }
    setStops(lastStructuralChange.stops);
    setDayAllocations(lastStructuralChange.allocations);
    setManualNightStopIds(lastStructuralChange.manualNightStopIds);
    setStartDate(lastStructuralChange.startDate);
    setEndDate(lastStructuralChange.endDate);
    setScheduleLocks(lastStructuralChange.locks);
    setPlaceSelections(lastStructuralChange.placeSelections);
    setCompletedPlanningAreaMentionIds(lastStructuralChange.completedPlanningAreaMentionIds);
    setRemovedPlaceMentionIds(lastStructuralChange.removedPlaceMentionIds);
    setCapturedStructuredBrief((current) => ({ ...current, countryDiscoveryChoices: lastStructuralChange.countryDiscoveryChoices,
      discoveryDraftByMentionId: lastStructuralChange.discoveryDraftByMentionId,
      placeSelections: lastStructuralChange.capturedPlaceSelections, destinations: lastStructuralChange.capturedDestinations,
      mustVisit: lastStructuralChange.capturedMustVisit }));
    setNightEditFeedback(null);
    setLastStructuralChange(null);
  };

  const stopRemovalSafety = (stopId: string) => {
    const stop = activeTripDocument.stops.find((item) => item.id === stopId);
    const bookings = activeTripDocument.brief.bookings ?? [];
    const blocked = bookings.some((booking) => {
      if (booking.type !== "stay") return false;
      const exactStop = activeTripDocument.stops.find((item) => booking.id === `stay-${item.id}`);
      const namedStops = activeTripDocument.stops.filter((item) => booking.title.toLocaleLowerCase().includes(item.name.toLocaleLowerCase()));
      // Preserve the existing saved-stay owner. Its legacy name fallback must
      // never delete a different occurrence or an ambiguously associated stay.
      const legacyOwner = activeTripDocument.stops.find((item) => booking.id === `stay-${item.id}`
        || booking.title.toLocaleLowerCase().includes(item.name.toLocaleLowerCase()));
      return legacyOwner?.id === stopId && (exactStop ? exactStop.id !== stopId : namedStops.length > 1);
    });
    const associated = bookings.filter((booking) => {
      const exactStop = activeTripDocument.stops.find((item) => booking.id === `stay-${item.id}`);
      if (exactStop) return exactStop.id === stopId;
      return Boolean(stop && (booking.title.toLocaleLowerCase().includes(stop.name.toLocaleLowerCase())
        || (booking.date && stop.arrivalDate && stop.departureDate && booking.date >= stop.arrivalDate && booking.date < stop.departureDate)));
    });
    return { blocked, hasStay: associated.some((booking) => booking.type === "stay"), hasBookings: associated.length > 0 };
  };

  const removeStop = (stopId: string) => {
    const stop = stops.find((item) => item.id === stopId);
    if (!stop) return;
    if (scheduleLocks.stopIds.includes(stopId)) return;
    if (stopRemovalSafety(stopId).blocked) {
      setStopRemovalBlocked({ id: stopId, name: stop.name });
      return;
    }
    setStopRemovalBlocked(null);
    if (builderEditSessionRef.current) {
      rememberStructuralChange("remove_stop", 1);
      if (dispatchAcceptedBuilderEdit(builderRemoveCommand(builderEditSessionRef.current.getSnapshot().trip, stopId))) {
        setRoutePreviewStopIds(null); setSelectedRouteStopId(null); setNightEditFeedback(null);
      }
      return;
    }
    rememberStructuralChange("remove_stop", Math.max(0, stops.length - stops.findIndex((item) => item.id === stopId) - 1));
    const linkedSelection = placeSelections.find((selection) => selection.routeStopId === stopId);
    const linkedMention = linkedSelection
      ? undefined
      : capturedStructuredBrief.placeMentions?.find((mention) => handoffStopOccurrenceId(mention, handoffOccurrenceMentionIdsRef.current) === stopId);
    if (linkedSelection) {
      setPlaceSelections((current) => current.filter((selection) => selection.routeStopId !== stopId));
      setCapturedStructuredBrief((current) => {
        const independentlyNamed = current.placeMentions?.some((mention) => mention.mentionId !== linkedSelection.mentionId
          && mention.canonicalPlaceId === linkedSelection.selectedCanonicalPlaceId) ?? false;
        return {
          ...current,
          // The structured-brief merge preserves old facts. Remove only this
          // country-child's saved projection, not its broad parent or a city
          // independently named in the traveller's original intent.
          placeSelections: current.placeSelections?.filter((selection) => selection.routeStopId !== stopId),
          destinations: independentlyNamed ? current.destinations : current.destinations.filter((destination) =>
            destination.id !== stopId && !(destination.placeMentionId === linkedSelection.mentionId
              && destination.canonicalPlaceId === linkedSelection.selectedCanonicalPlaceId)),
          mustVisit: independentlyNamed ? current.mustVisit : current.mustVisit.filter((destination) =>
            destination.id !== stopId && destination.name.toLocaleLowerCase() !== stop.name.toLocaleLowerCase()),
          countryDiscoveryChoices: {
            ...current.countryDiscoveryChoices,
            [linkedSelection.mentionId]: updateCountryDiscoveryChoice(current.countryDiscoveryChoices?.[linkedSelection.mentionId] ?? [], linkedSelection.selectedCanonicalPlaceId, false),
          },
        };
      });
      const remainingForMention = placeSelections.filter((selection) => selection.mentionId === linkedSelection.mentionId && selection.routeStopId !== stopId);
      if (!remainingForMention.length) setCompletedPlanningAreaMentionIds((current) => current.filter((mentionId) => mentionId !== linkedSelection.mentionId));
    }
    else if (linkedMention) setRemovedPlaceMentionIds((current) => [...new Set([...current, linkedMention.mentionId])]);
    const remainingStops = stops.filter((item) => item.id !== stopId);
    setStops(remainingStops);
    if (!remainingStops.length) setShowStopEditor(true);
    // A removal releases nights for the traveller to allocate. Freeze the
    // current remaining counts through the existing manual-allocation model.
    setDayAllocations(Object.fromEntries(remainingStops.map((item) => [item.id, allocation[item.id] ?? 0])));
    setManualNightStopIds(remainingStops.map((item) => item.id));
    setRoutePreviewStopIds(null);
    setSelectedRouteStopId((current) => current === stopId ? remainingStops[0]?.id ?? null : current);
    setNightEditFeedback(null);
    setScheduleLocks((current) => { const arrivalDates = { ...current.arrivalDates }; delete arrivalDates[stopId]; return { stopIds: current.stopIds.filter((id) => id !== stopId), arrivalDates }; });
    setDecisionSelections((current) => ({ ...current, routeOrder: undefined }));
  };

  const requestRemoveStop = (stopId: string) => {
    const stop = stops.find((item) => item.id === stopId);
    if (!stop || scheduleLocks.stopIds.includes(stopId)) return;
    const plannedDays = activeTripDocument.planItems.filter((item) => item.stopId === stopId).length;
    const safety = stopRemovalSafety(stopId);
    if (safety.blocked) {
      setStopRemovalBlocked({ id: stopId, name: stop.name });
      return;
    }
    setStopRemovalBlocked(null);
    const savedIdeas = activeTripDocument.brief.itineraryIdeas?.filter((idea) => idea.stopId === stopId).length ?? 0;
    if (!plannedDays && !savedIdeas && !safety.hasBookings) {
      removeStop(stopId);
      return;
    }
    const destination = canonicalBuilder?.brief.intent.route.destinations.find(intent => intent.stopIds.includes(stopId));
    setPendingStopRemoval({ id: stopId, name: stop.name, plannedDays, savedIdeas, nights: allocation[stopId] ?? 0, hasStay: safety.hasStay, hasBookings: safety.hasBookings,
      ...(canonicalBuilder && destination ? { binding: { ownerId: activeBrowserOwnerIdRef.current, tripId: canonicalBuilder.id, intentId: destination.id,
        canonicalStopId: canonicalTripStopIdentityMap(canonicalBuilder).get(stopId)!, placeKey: JSON.stringify([stop.canonicalPlaceId, stop.providerId, stop.name, stop.country]) } } : {}) });
  };

  const confirmStopRemoval = () => {
    if (!pendingStopRemoval) return;
    const pending = pendingStopRemoval, binding = pending.binding;
    const current = builderEditSessionRef.current?.getSnapshot().trip;
    const destination = binding && current?.brief.intent.route.destinations.find(intent => intent.id === binding.intentId);
    const targetId = stops.some(stop => stop.id === pending.id) ? pending.id : binding?.canonicalStopId;
    const stop = stops.find(item => item.id === targetId);
    if (!stop || binding && (!current || current.id !== binding.tripId || activeBrowserOwnerIdRef.current !== binding.ownerId
      || !destination?.stopIds.includes(stop.id) || JSON.stringify([stop.canonicalPlaceId, stop.providerId, stop.name, stop.country]) !== binding.placeKey)) {
      setPendingStopRemoval({ ...pending, error: language === "es" ? "Esta parada ha cambiado. Cierra esta revisión y selecciónala de nuevo." : "This stop changed. Close this review and choose it again." });
      return;
    }
    const safety = stopRemovalSafety(stop.id);
    if (scheduleLocks.stopIds.includes(stop.id) || safety.blocked) {
      setPendingStopRemoval({ ...pending, error: language === "es" ? "Esta parada está protegida. Revisa sus fechas y reservas." : "This stop is protected. Review its dates and bookings." });
      return;
    }
    const reviewed = { name: stop.name, plannedDays: activeTripDocument.planItems.filter(item => item.stopId === stop.id).length,
      savedIdeas: activeTripDocument.brief.itineraryIdeas?.filter(idea => idea.stopId === stop.id).length ?? 0,
      nights: allocation[stop.id] ?? 0, hasStay: safety.hasStay, hasBookings: safety.hasBookings };
    if (Object.entries(reviewed).some(([key, value]) => pending[key as keyof typeof reviewed] !== value)) {
      setPendingStopRemoval({ ...pending, ...reviewed, id: stop.id, error: language === "es" ? "El plan ha cambiado. Revisa las consecuencias actualizadas antes de confirmar." : "The plan changed. Review the updated consequences before confirming." });
      return;
    }
    removeStop(stop.id);
    setPendingStopRemoval(null); setEditingRouteStopId(null);
  };

  const updateTravelRange = (requestedStart: string, requestedEnd: string) => {
    const nextStart = requestedStart;
    const nextEnd = requestedEnd < requestedStart ? requestedStart : requestedEnd;
    if (!builderEditSessionRef.current && nextStart === startDate && nextEnd === endDate) return;
    rememberStructuralChange("change_trip_dates", stops.length);
    if (builderEditSessionRef.current) {
      if (dispatchAcceptedBuilderEdits([{ kind: "dates", startDate: nextStart, endDate: nextEnd }], {acceptedInputs:builderEditSessionRef.current.getSnapshot().draft.fields.filter(field=>field.binding.kind==="date"&&parseTypedLocalDate(field.raw)===(field.binding.field==="startDate"?nextStart:nextEnd)).map(field=>({binding:field.binding,raw:field.raw}))})) {
        setDatesManuallyEdited(true); setEndDateStillSuggested(false);
      }
      return;
    }
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setDatesManuallyEdited(true);
    setEndDateStillSuggested(false);
  };

  const updateTravellers = (value: number) => {
    setTravellersManuallyEdited(true);
    if (builderEditSessionRef.current) {
      dispatchAcceptedBuilderEdit({ kind: "travellers", travellers: Math.max(1, Math.min(12, value)) });
      return;
    }
    setTripIntent((current) => ({ ...current, travellers: Math.max(1, Math.min(12, value)) }));
  };

  const updateAllocatedDays = (stopId: string, requested: number) => {
    if (protectedBuilderStopIds.includes(stopId)) return;
    const live = builderEditSessionRef.current?.getSnapshot().trip;
    const current = live ? live.stops.find(stop => stop.id === stopId)?.nights ?? 0 : allocation[stopId] ?? 0;
    const budget = live ? tripNightsBetween(live.startDate, live.endDate) : totalNights;
    const next = Math.max(0, Math.min(budget, Math.round(requested)));
    if (next === current) return;
    if (builderEditSessionRef.current) {
      rememberStructuralChange("change_nights", 1);
      dispatchAcceptedBuilderEdit(builderNightsCommand(builderEditSessionRef.current.getSnapshot().trip, stopId, next));
      return;
    }
    const nextManualStopIds = [...new Set([...manualNightStopIds, stopId])];
    const rebalanced = rebalanceTripNights({
      totalNights,
      stops: nightAllocationStops,
      pace: effectiveIntent.preferences.pace,
      interests: effectiveIntent.preferences.interests,
      fixedCommitments: fixedAllocationCommitments,
      knowledge: sourceRouteKey ? routeHandoffNightKnowledge : undefined,
      currentAllocations: { ...allocation, [stopId]: next },
      manualStopIds: nextManualStopIds,
    });
    const nextAllocation = rebalanced.nightAllocation.allocations ?? { ...allocation, [stopId]: next };
    rememberStructuralChange("change_nights", Math.max(1, rebalanced.automaticChanges.length + 1));
    setManualNightStopIds(rebalanced.manualStopIds);
    setDayAllocations(nextAllocation);
    setNightEditFeedback(nightRebalanceFeedback(rebalanced, language));
  };

  const adjustAllocatedDays = (stopId: string, delta: number) => {
    const live = builderEditSessionRef.current?.getSnapshot().trip;
    const current = live ? live.stops.find(stop => stop.id === stopId)?.nights ?? 0 : allocation[stopId] ?? 0;
    updateAllocatedDays(stopId, current + delta);
  };

  const beginRouteEdit = (stopId: string) => {
    setEditingRouteStopId(stopId);
    setRouteNightDraft((current) => current ?? { ...allocation });
  };

  const updateRouteNightDraft = (stopId: string, requested: number) => {
    if (scheduleLocks.stopIds.includes(stopId) || scheduleLocks.arrivalDates[stopId]) return;
    setRouteNightDraft((current) => ({ ...(current ?? allocation), [stopId]: Math.max(0, Math.min(totalNights, Math.round(requested) || 0)) }));
  };

  const applyRouteNightsToDates = () => {
    if (!routeNightDraft) return;
    rememberStructuralChange("change_trip_dates", stops.length);
    const editedIds = stops.filter((stop) => routeNightDraft[stop.id] !== allocation[stop.id]).map((stop) => stop.id);
    const nextEnd = new Date(`${startDate}T00:00:00`);
    nextEnd.setDate(nextEnd.getDate() + Math.max(0, routeNights));
    if(builderEditSessionRef.current){
      const trip=builderEditSessionRef.current.getSnapshot().trip;
      const commands:BuilderAcceptedEdit[]=[{kind:"dates",startDate:trip.startDate,endDate:iso(nextEnd)}];
      for(const id of editedIds){const command=builderNightsCommand(trip,id,routeNightDraft[id]);if(!command)return;commands.push(command);}
      if(!dispatchAcceptedBuilderEdits(commands))return;
      setRouteNightDraft(null);setEditingRouteStopId(null);return;
    }
    setDayAllocations(routeNightDraft);
    setManualNightStopIds((current) => [...new Set([...current, ...editedIds])]);
    setEndDate(iso(nextEnd));
    setDatesManuallyEdited(true);
    setEndDateStillSuggested(false);
    setRouteNightDraft(null);
    setEditingRouteStopId(null);
  };

  const rebalanceRouteNightsToDates = () => {
    if (!routeNightDraft) return;
    rememberStructuralChange("change_nights", stops.length);
    const editedIds = stops.filter((stop) => routeNightDraft[stop.id] !== allocation[stop.id]).map((stop) => stop.id);
    const rebalanced = rebalanceTripNights({
      totalNights,
      stops: nightAllocationStops,
      pace: effectiveIntent.preferences.pace,
      interests: effectiveIntent.preferences.interests,
      fixedCommitments: fixedAllocationCommitments,
      knowledge: sourceRouteKey ? routeHandoffNightKnowledge : undefined,
      currentAllocations: routeNightDraft,
      manualStopIds: [...new Set([...manualNightStopIds, ...editedIds])],
    });
    if(builderEditSessionRef.current){
      const trip=builderEditSessionRef.current.getSnapshot().trip,allocations=rebalanced.nightAllocation.allocations;
      if(!allocations)return;
      const commands:BuilderAcceptedEdit[]=[];
      for(const stop of trip.stops){if(allocations[stop.id]===stop.nights)continue;const command=builderNightsCommand(trip,stop.id,allocations[stop.id]);if(!command)return;commands.push(command);}
      if(commands.length && !dispatchAcceptedBuilderEdits(commands))return;
      setNightEditFeedback(nightRebalanceFeedback(rebalanced,language));setRouteNightDraft(null);setEditingRouteStopId(null);return;
    }
    if (rebalanced.nightAllocation.allocations) setDayAllocations(rebalanced.nightAllocation.allocations);
    setManualNightStopIds(rebalanced.manualStopIds);
    setNightEditFeedback(nightRebalanceFeedback(rebalanced, language));
    setRouteNightDraft(null);
    setEditingRouteStopId(null);
  };

  const beginPlanningAreaClarification = (
    suggestion: CanonicalPlaceSuggestion,
    role: "preferred" | "origin" = "preferred",
  ) => {
    const currentResult: PlaceIntelligenceResult = {
      version: PLACE_INTELLIGENCE_VERSION,
      parserVersion: PLACE_INTELLIGENCE_PARSER_VERSION,
      sequenceKind: "unordered",
      mentions: capturedStructuredBrief.placeMentions ?? intakeMentions,
      issues: capturedStructuredBrief.placeIssues ?? [],
    };
    const appended = appendSelectedPlanningAreaMention(currentResult, suggestion, role);
    if(builderEditSessionRef.current) {
      const edits:BuilderAcceptedEdit[]=[{kind:"planning-mention",mention:appended.mention,action:"add"}];
      if(role!=="origin" && !builderEditSessionRef.current.getSnapshot().trip.brief.intent.route.destinations.some(intent=>intent.id===appended.mention.mentionId))
        edits.push({kind:"add-destination",intent:{id:appended.mention.mentionId,sourceText:appended.mention.sourceText,kind:"planning_area",selectedPlace:{name:suggestion.name,canonicalPlaceId:suggestion.canonicalPlaceId,country:suggestion.country},resolution:"unresolved",requestedNights:null,routeMembership:"required",stopIds:[]}});
      if(!dispatchAcceptedBuilderEdits(edits,{acceptedInputs:role!=="origin"?[{binding:{kind:"destination-add"},raw:stopInput}]:undefined})) return null;
    }
    setCapturedStructuredBrief((current) => ({
      ...current,
      placeMentions: appended.result.mentions,
      placeIssues: appended.result.issues,
      source: { ...current.source, inputs: current.source.inputs.includes("builder") ? current.source.inputs : [...current.source.inputs, "builder"] },
    }));
    setIntakeMentions(appended.result.mentions);
    setRemovedPlaceMentionIds((current) => current.filter((mentionId) => mentionId !== appended.mention.mentionId));
    setTransientPlanningMentionId(appended.mention.mentionId);
    setBaseSearchInputs((current) => ({ ...current, [appended.mention.mentionId]: "" }));
    setBaseSearchErrors((current) => ({ ...current, [appended.mention.mentionId]: "" }));
    setStopError("");
    setStopChecking(false);
    if (role === "origin") {
      originBeforePlanningClarificationRef.current = {
        name: origin,
        coordinates: originCoordinates,
        canonicalPlaceId: originCanonicalPlaceId,
        country: originCountry,
        providerId: originProviderId,
        touched: originTouched,
      };
      if(!builderEditSessionRef.current) replaceJourneyOrigin({ name: suggestion.name });
      setOriginError("");
      setOriginTouched(true);
      setOriginPlanningMentionId(appended.mention.mentionId);
    } else {
      setResolvingPlaceMentionId(null);
      setStopInput("");
      setShowStopEditor(false);
      setSummaryFocus("stops");
      setClarificationSessionIds([appended.mention.mentionId]);
      setClarificationIndex(0);
      setClarificationAutoOpened(true);
      setClarificationDismissed(false);
      setClarificationOpen(true);
    }
    return appended.mention;
  };

  const cancelTransientPlanningClarification = (mentionId: string) => {
    if (mentionId === transientPlanningMentionId) {
      const mention=capturedStructuredBrief.placeMentions?.find(item=>item.mentionId===mentionId);
      if(builderEditSessionRef.current) {
        if(!mention)return;
        const intent=builderEditSessionRef.current.getSnapshot().trip.brief.intent.route.destinations.find(intent=>intent.id===mentionId);
        if(intent?.stopIds.length)return;
        const edits:BuilderAcceptedEdit[]=[...(intent?[{kind:"remove-destination" as const,intentId:intent.id}]:[]),{kind:"planning-mention",mention,action:"cancel"}];
        if(!dispatchAcceptedBuilderEdits(edits))return;
      }
      handoffLookupSessionRef.current?.handled.add(mentionId);
      setCapturedStructuredBrief((current) => {
        const mentions = (current.placeMentions ?? []).filter((mention) => mention.mentionId !== mentionId);
        return {
          ...current,
          placeMentions: mentions,
          placeIssues: placeResolutionIssuesForMentions(mentions),
          placeSelections: (current.placeSelections ?? []).filter((selection) => selection.mentionId !== mentionId),
        };
      });
      setIntakeMentions((current) => current.filter((mention) => mention.mentionId !== mentionId));
      setPlaceSelections((current) => current.filter((selection) => selection.mentionId !== mentionId));
      setCompletedPlanningAreaMentionIds((current) => current.filter((id) => id !== mentionId));
      setRemovedPlaceMentionIds((current) => current.filter((id) => id !== mentionId));
      setTransientPlanningMentionId(null);
    }
    setBaseSearchInputs((current) => { const next = { ...current }; delete next[mentionId]; return next; });
    setBaseSearchErrors((current) => { const next = { ...current }; delete next[mentionId]; return next; });
  };

  const addStop = async (
    name?: string,
    countryOverride?: string,
    resolvesMentionId?: string,
    selectionDraft?: PlaceSelectionDraft,
    canonicalSuggestion?: CanonicalPlaceSuggestion,
    discoverySelectionVerified = false,
    acceptedCountryReview?: NonNullable<typeof countryAddReview>,
  ) => {
    const sourceSnapshot=builderEditSessionRef.current?.getSnapshot();
    const expectedInputRevision = sourceSnapshot?.inputRevision;
    const lookupSequence=++addPlaceLookupSequenceRef.current;
    if(acceptedCountryReview&&(countryAddReviewRef.current!==acceptedCountryReview||!sourceSnapshot
      ||sourceSnapshot.trip.id!==acceptedCountryReview.tripId||sourceSnapshot.browserOwnerId!==acceptedCountryReview.ownerId
      ||sourceSnapshot.inputRevision!==acceptedCountryReview.revision||stopInput!==acceptedCountryReview.raw)){
      cancelCountryAddReview();setStopError("The trip changed. Choose this place again.");return;
    }
    const targetMentionId = resolvesMentionId ?? resolvingPlaceMentionId;
    const targetMention = targetMentionId
      ? (capturedStructuredBrief.placeMentions ?? intakeMentions).find((mention) => mention.mentionId === targetMentionId)
      : undefined;
    const lookupIsCurrent=()=>{
      if(!sourceSnapshot)return true;
      const current=builderEditSessionRef.current?.getSnapshot();
      if(!current||lookupSequence!==addPlaceLookupSequenceRef.current||current.trip.id!==sourceSnapshot.trip.id
        ||current.browserOwnerId!==sourceSnapshot.browserOwnerId||activeBrowserOwnerIdRef.current!==sourceSnapshot.browserOwnerId
        ||current.inputRevision!==expectedInputRevision)return false;
      if(targetMentionId)return current.trip.brief.intent.route.destinations.some(intent=>intent.id===targetMentionId)
        ||Boolean(current.trip.brief.structuredBrief?.placeMentions?.some(mention=>mention.mentionId===targetMentionId));
      const raw=current?.draft.fields.find(field=>field.binding.kind==="destination-add"&&field.status==="editable")?.raw??"";
      return Boolean(current&&lookupSequence===addPlaceLookupSequenceRef.current&&current.trip.id===sourceSnapshot.trip.id
        &&current.browserOwnerId===sourceSnapshot.browserOwnerId&&current.inputRevision===expectedInputRevision&&raw===stopInput);
    };
    const fail = (message: string) => {
      if(!lookupIsCurrent())return;
      if (targetMentionId) setBaseSearchErrors((current) => ({ ...current, [targetMentionId]: message }));
      else setStopError(message);
    };
    const value = (name ?? stopInput).trim();
    if (!value) return fail(ui.typePlace);
    if (!targetMentionId && isDuplicatePlaceIdentity(stops, {
      name: value,
      canonicalPlaceId: canonicalSuggestion?.canonicalPlaceId,
    })) return fail(`${value} is already in your route.`);
    if (!targetMentionId && canonicalSuggestion && placeSuggestionRequiresBaseSelection(canonicalSuggestion)) {
      beginPlanningAreaClarification(canonicalSuggestion);
      return;
    }
    if (targetMentionId) setBaseSearchErrors((current) => ({ ...current, [targetMentionId]: "" }));
    else { setStopError(""); setStopChecking(true); }
    try {
      if (canonicalSuggestion && !isOvernightBaseEligible({
        placeType: canonicalSuggestion.placeType,
        routability: canonicalSuggestion.routability ?? "direct_destination",
      })) {
        return fail(language === "es"
          ? `Elige un lugar donde alojarte para ${canonicalSuggestion.name}.`
          : `Choose a place to stay for ${canonicalSuggestion.name}.`);
      }
      // A regional brief can legitimately cross a border (for example,
      // Patagonia into Tierra del Fuego). Do not inherit the previous stops'
      // country while the traveller is resolving one of those regional bases.
      const routeCountry = countryOverride ?? (!targetMentionId && stops.length && stops.every((stop) => stop.country === stops[0].country) ? stops[0].country : undefined);
      const nearby = stops.at(-1)?.coordinates;
      const canonicalResolved: LocationChoice | null = acceptedCountryReview?.resolved ?? (canonicalSuggestion?.coordinates ? {
        name: canonicalSuggestion.name,
        country: canonicalSuggestion.country,
        countryCode: countryCodeFor(canonicalSuggestion.country) ?? undefined,
        region: canonicalSuggestion.region,
        coordinates: canonicalSuggestion.coordinates,
        kind: canonicalSuggestion.placeType,
        placeType:canonicalSuggestion.placeType,routability:canonicalSuggestion.routability??'direct_destination',
        canonicalPlaceId: canonicalSuggestion.canonicalPlaceId,
        providerId: canonicalSuggestion.provenance.find((source) => source.kind === "provider")?.id,
        referenceSnapshotId:canonicalSuggestion.referenceSnapshotId,
      } : null);
      const resolved = canonicalResolved ?? await (async () => {
        const response = await fetch(`/api/journey-geocode?place=${encodeURIComponent(canonicalSuggestion?.name ?? value)}${routeCountry ? `&country=${encodeURIComponent(routeCountry)}` : ""}${nearby ? `&nearLat=${nearby[1]}&nearLon=${nearby[0]}` : ""}`);
        const payload = await response.json() as { result?: { canonicalPlaceId?: string; name?: string; country?: string; countryCode?: string; region?: string; providerId?: string; coordinates?: [number, number]; kind?: string; locality?: string } | null };
        return payload.result;
      })();
      if(!lookupIsCurrent())return;
      if (!resolved?.coordinates || !resolved.country) return fail(language === "es" ? `No pudimos verificar “${value}”. Prueba una ciudad, región o lugar con su país.` : `We couldn't verify “${value}”. Try a city, region or landmark with its country.`);
      const selectedCanonicalPlaceId = canonicalSuggestion?.canonicalPlaceId ?? selectionDraft?.selectedCanonicalPlaceId;
      if (selectedCanonicalPlaceId && !canonicalPlaceFactsMatch(selectedCanonicalPlaceId, { country: resolved.country, coordinates: resolved.coordinates })) {
        return fail(language === "es"
          ? `La ubicación devuelta para “${value}” no coincide con la identidad canónica de Morrovia. Revísala antes de añadirla.`
          : `The location returned for “${value}” does not match Morrovia's canonical identity. Review it before adding.`);
      }
      const targetUsesNearbyBase = Boolean(targetMention
        && !requiresPhysicalIslandVerification(targetMention)
        && targetMention.routability !== "direct_destination"
        && ["landmark", "natural_area", "island", "archipelago", "coast", "mountain_range", "valley", "travel_corridor"].includes(targetMention.placeType));
      const targetNearbyAnchor = targetMention && !requiresPhysicalIslandVerification(targetMention) ? nearbyBaseAnchorForMention(targetMention) : undefined;
      if (targetUsesNearbyBase && !targetNearbyAnchor) {
        return fail(language === "es"
          ? `Morrovia no tiene datos de ubicación suficientemente fiables para verificar una base cerca de ${placeDisplayName(targetMention!)}. Se conserva tu intención original.`
          : `Morrovia does not have trustworthy enough location data to verify a base near ${placeDisplayName(targetMention!)}. Your original intent is preserved.`);
      }
      const resolvedCandidate = {
        providerId: canonicalSuggestion?.canonicalPlaceId ?? resolved.providerId ?? resolved.canonicalPlaceId ?? value,
        canonicalName: canonicalSuggestion?.name ?? resolved.name ?? value,
        placeType: canonicalSuggestion?.placeType ?? (/city/.test(resolved.kind ?? "") ? "city" as const : "town" as const),
        parentCountries: [resolved.country],
        parentRegionId: canonicalSuggestion?.region ?? resolved.region,
        coordinates: resolved.coordinates,
        routability: "direct_destination" as const,
      };
      if (targetMention && requiresPhysicalIslandVerification(targetMention)) {
        const verified = await verifyPhysicalIslandSuggestion(planningParentForMention(targetMention), canonicalSuggestion ?? {
          canonicalPlaceId: resolved.canonicalPlaceId ?? (resolved.providerId ? `open-world:${resolved.providerId}` : ""),
          name: resolvedCandidate.canonicalName, label: `${resolvedCandidate.canonicalName}, ${resolved.country}`, country: resolved.country,
          placeType: resolvedCandidate.placeType, coordinates: resolved.coordinates, routability: "direct_destination",
          provenance: resolved.providerId ? [{ id: resolved.providerId, label: "Settlement geography", kind: "provider", supports: "Traveller-selected settlement." }] : [],
        });
        if (!lookupIsCurrent()) return;
        if (!verified) return fail(language === "es"
          ? `No pudimos verificar esta base dentro de ${placeDisplayName(targetMention)}. Se conserva tu intención original.`
          : `We couldn't independently verify this base inside ${placeDisplayName(targetMention)}. Your original intent is preserved.`);
        canonicalSuggestion = verified;
        resolvedCandidate.parentRegionId = verified.region;
      }
      if (targetNearbyAnchor && !placeCandidateSuitableAsNearbyBase(targetNearbyAnchor, resolvedCandidate)) {
        const preposition = nearbyBaseSearchPreposition(targetNearbyAnchor);
        return fail(language === "es"
          ? `${value} no es una base cercana verificada para ${placeDisplayName(targetMention!)}. Busca otro lugar cercano.`
          : `${value} is not a verified base ${preposition} ${placeDisplayName(targetMention!)}. Search for another nearby place.`);
      }
      if (targetMention && !discoverySelectionVerified && !targetNearbyAnchor && (targetMention.requiresBaseSelection || targetMention.routability === "planning_area") && !placeCandidateWithinPlanningParent({
        canonicalName: resolvedCandidate.canonicalName,
        placeType: resolvedCandidate.placeType,
        parentCountries: resolvedCandidate.parentCountries,
        parentRegionId: resolvedCandidate.parentRegionId,
        coordinates: resolvedCandidate.coordinates,
      }, planningParentForMention(targetMention))) {
        return fail(language === "es"
          ? `${value} no está dentro de ${placeDisplayName(targetMention)}. Busca otro lugar dentro de esa geografía.`
          : `${value} is not inside ${placeDisplayName(targetMention)}. Search for another place within that geography.`);
      }
      const resolvedCountry = resolved.country;
      const resolvedName = (canonicalSuggestion?.name ?? resolved.name?.split(",")[0]?.trim()) || value;
      if(!targetMentionId&&sourceSnapshot){
        const current=builderEditSessionRef.current?.getSnapshot();
        if(!current||!lookupIsCurrent())return;
        if(!validPlaceCoordinates(resolved.coordinates))return fail(ui.unavailable);
        const structured=current.trip.brief.structuredBrief;
        const countries=[...current.trip.stops.map(stop=>stop.country),current.trip.brief.intent.route.origin?.country,
          current.trip.brief.intent.route.journeyEnd.mode==="explicit"?current.trip.brief.intent.route.journeyEnd.place.country:undefined,
          ...current.trip.brief.intent.route.destinations.map(intent=>intent.selectedPlace?.country),
          ...(structured?.countries.map(country=>country.value)??[]),
          ...(structured?.placeMentions?.filter(mention=>mention.role!=="excluded"&&!structured.removedPlaceMentionIds?.includes(mention.mentionId)).flatMap(mention=>mention.parentCountries)??[])];
        const countryKey=(country:string)=>countryCodeFor(country)??country.trim().toLocaleLowerCase();
        const knownCountry=countries.some(country=>country&&countryKey(country)===countryKey(resolvedCountry));
        if(!knownCountry&&!acceptedCountryReview){
          const review={suggestion:canonicalSuggestion,resolved:resolved as LocationChoice,name:resolvedName,country:resolvedCountry,raw:stopInput,revision:current.inputRevision,tripId:current.trip.id,ownerId:current.browserOwnerId};
          countryAddReviewRef.current=review;setCountryAddReview(review);return;
        }
      }
      // A landmark or planning-area base may already be a route occurrence.
      // Provider and catalogue IDs can differ for the same physical city; use
      // the shared geographic identity check, never display-name deduplication.
      const boundAreaIntent = sourceSnapshot?.trip.brief.intent.route.destinations.find(intent=>intent.id===targetMentionId&&intent.kind==='planning_area');
      const unverifiedAreaOccurrence = boundAreaIntent?.stopIds.length===1
        ?sourceSnapshot?.trip.stops.find(stop=>stop.id===boundAreaIntent.stopIds[0]&&!geographicallyReady(stopGeographicPlace(stop))):undefined;
      if(unverifiedAreaOccurrence && sourceSnapshot!.trip.brief.intent.route.destinations.some(intent=>intent.id!==targetMentionId&&intent.stopIds.includes(unverifiedAreaOccurrence.id)))
        return fail('This stay belongs to more than one source. Review its current binding.');
      const existingBaseMatches = !unverifiedAreaOccurrence && targetMention && targetMention.routability !== "direct_destination"
        ? stops.filter((stop) => isSameCanonicalPlace(stop, {
          name: resolvedName, country: resolvedCountry,
          canonicalPlaceId: selectedCanonicalPlaceId ?? resolved.canonicalPlaceId,
          providerId: resolved.providerId, coordinates: resolved.coordinates,
        }))
        : [];
      if (existingBaseMatches.length > 1) return fail(language === "es"
        ? `${resolvedName} aparece más de una vez en tu ruta. Elige desde qué parada visitarlo.`
        : `${resolvedName} appears more than once in your route. Choose which stop to visit from.`);
      const existingBase = existingBaseMatches[0];
      const multiPlacePlanningMention = Boolean(targetMention && placeMentionSupportsMultipleSelections(targetMention));
      const existingTargetSelection = targetMentionId && !multiPlacePlanningMention
        ? placeSelections.find((selection) => selection.mentionId === targetMentionId && (selection.kind === "base" || selection.kind === "visit"))
        : undefined;
      const replaceableRouteStopId = unverifiedAreaOccurrence?.id ?? (existingTargetSelection?.routeStopId
        && !placeSelections.some((selection) => selection.mentionId !== targetMentionId && selection.routeStopId === existingTargetSelection.routeStopId)
        ? existingTargetSelection.routeStopId
        : undefined);
      const unresolvedCapturedOccurrence = Boolean(targetMention && capturedStructuredBrief.destinations.some((destination) =>
        destination.placeMentionId === targetMentionId && !destination.canonicalPlaceId));
      const capturedOccurrenceId = unresolvedCapturedOccurrence && targetMention
        ? handoffStopOccurrenceId(targetMention, handoffOccurrenceMentionIdsRef.current)
        : undefined;
      const id = existingBase?.id ?? replaceableRouteStopId ?? capturedOccurrenceId ?? `${resolvedName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
      const addedStop: Stop = {
        id,
        name: resolvedName,
        country: resolvedCountry,
        canonicalPlaceId: selectedCanonicalPlaceId ?? resolved.canonicalPlaceId ?? (resolved.providerId ? `open-world:${resolved.providerId}` : undefined),
        countryCode: resolved.countryCode,
        region: canonicalSuggestion?.region ?? resolved.region,
        providerId: resolved.providerId,
        coordinates: resolved.coordinates,
        locality: resolved.locality,
      };
      const acceptedPlace=acceptedGeographicPlace({name:addedStop.name,country:addedStop.country,canonicalPlaceId:addedStop.canonicalPlaceId,providerId:addedStop.providerId,coordinates:addedStop.coordinates},
        {...resolved,name:resolvedName,placeType:canonicalSuggestion?.placeType??resolved.kind,routability:canonicalSuggestion?.routability??('routability' in resolved?resolved.routability as string:undefined)});
      if(!acceptedPlace)return fail(language==='es'?'Elige una ciudad o población verificada.':'Choose a verified city or town.');
      addedStop.geographicBinding=acceptedPlace.geographicBinding;
      const selectedCommands: BuilderAcceptedEdit[] = [];
      if (!existingBase) {
        rememberStructuralChange(replaceableRouteStopId ? "change_regional_base" : "add_stop", 1);
        if (builderEditSessionRef.current) {
          if (expectedInputRevision === undefined) return fail("The trip changed while this place was being checked. Try again.");
          const currentTrip = builderEditSessionRef.current.getSnapshot().trip;
          const intentId = targetMentionId && currentTrip.brief.intent.route.destinations.some(intent => intent.id === targetMentionId)
            ? targetMentionId : undefined;
          // Search resolves this exact pending source in the same accepted batch
          // as its occurrence and night request. A planning-area base keeps its
          // original area identity and still requires independent containment.
          const sourceIntent = currentTrip.brief.intent.route.destinations.find(intent => intent.id === intentId);
          const sourceMention = currentTrip.brief.structuredBrief?.placeMentions?.find(mention => mention.mentionId === intentId);
          if (sourceIntent?.kind === "overnight_place" && sourceMention && sourceMention.status !== "resolved" && canonicalSuggestion) {
            const selectedResult = selectPlaceSearchSuggestion({
              version: PLACE_INTELLIGENCE_VERSION, parserVersion: PLACE_INTELLIGENCE_PARSER_VERSION, sequenceKind: "unordered",
              mentions: currentTrip.brief.structuredBrief!.placeMentions!, issues: currentTrip.brief.structuredBrief!.placeIssues ?? [],
            }, sourceMention.mentionId, canonicalSuggestion);
            const selectedMention = selectedResult.mentions.find(mention => mention.mentionId === sourceMention.mentionId);
            if (!selectedMention || selectedMention.status !== "resolved" || selectedMention.canonicalPlaceId !== addedStop.canonicalPlaceId)
              return fail("This place could not be confirmed for its original source. Your trip is preserved.");
            selectedCommands.push({ kind: "planning-mention", action: "replace", expectedMention: sourceMention,
              mention: selectedMention });
          }
          const capturedPosition = targetMention ? insertHandoffOccurrence(stops, addedStop, targetMention, capturedStructuredBrief.placeMentions ?? intakeMentions, handoffCanonicalOccurrenceBindings(currentTrip.brief.intent.route, handoffOccurrenceMentionIdsRef.current), currentTrip.brief.intent.route.orderAuthority) : null;
          const nextCapturedStop = capturedPosition?.[capturedPosition.findIndex(stop => stop.id === id) + 1]?.id;
          const placeCommand=builderPlaceCommand(currentTrip, { stopId: id, intentId, beforeStopId: nextCapturedStop, place: {
            name: addedStop.name, country: addedStop.country, canonicalPlaceId: addedStop.canonicalPlaceId,
            providerId: addedStop.providerId, coordinates: addedStop.coordinates,
            geographicBinding:addedStop.geographicBinding,
          }, bindSourceNights: Boolean(intentId && targetMentionId && currentTrip.brief.intent.route.destinations.some(intent =>
            intent.id === intentId && intent.kind === "overnight_place" && intent.requestedNights !== null)) });
          if(!placeCommand)return fail("This destination binding changed. Review the current trip.");
          selectedCommands.push(placeCommand);
        } else setStops((current) => replaceableRouteStopId
          ? current.map((stop) => stop.id === replaceableRouteStopId ? addedStop : stop)
          : unresolvedCapturedOccurrence && targetMention
            ? insertHandoffOccurrence(current, addedStop, targetMention, capturedStructuredBrief.placeMentions ?? intakeMentions, handoffOccurrenceMentionIdsRef.current)
            : [...current, addedStop]);
      }
      if (targetMentionId) {
        const nextSelection: PlaceSelection = {
          mentionId: targetMentionId,
          kind: selectionDraft?.kind ?? (targetMention?.routability === "anchor_or_poi"
            ? "visit"
            : targetMention?.requiresBaseSelection || targetMention?.routability === "planning_area"
              ? "base"
            : "ambiguity"),
          selectedCanonicalPlaceId: selectedCanonicalPlaceId ?? resolved.canonicalPlaceId ?? (resolved.providerId ? `open-world:${resolved.providerId}` : `builder-base:${resolvedName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`),
          selectedName: selectionDraft?.selectedName ?? resolvedName,
          selectedPlaceType: selectionDraft?.selectedPlaceType ?? canonicalSuggestion?.placeType ?? (/city/.test(resolved.kind ?? "") ? "city" : "town"),
          selectedParentCountries: selectionDraft?.selectedParentCountries ?? [resolvedCountry],
          routeStopId: id,
          provenance: (targetMention && requiresPhysicalIslandVerification(targetMention) ? canonicalSuggestion?.provenance[0] : selectionDraft?.provenance) ?? canonicalSuggestion?.provenance[0] ?? { id: `builder:${targetMentionId}:${id}`, label: "Traveller builder selection", kind: "builder", supports: "The traveller explicitly added this route base." },
          ...(targetMention?.routability === "anchor_or_poi" ? { relationshipType: "visit-from-base" as const } : {}),
        };
        if (builderEditSessionRef.current) selectedCommands.push({kind:"planning-selection",selection:nextSelection});
        else setPlaceSelections((current) => [nextSelection, ...current.filter((selection) => multiPlacePlanningMention
          ? selection.mentionId !== targetMentionId || (selection.selectedCanonicalPlaceId !== nextSelection.selectedCanonicalPlaceId && selection.routeStopId !== nextSelection.routeStopId)
          : selection.mentionId !== targetMentionId)]);
      } else {
        const restoredMention = capturedStructuredBrief.placeMentions?.find((mention) => [mention.canonicalName, mention.sourceText, ...mention.aliases]
          .some((label) => label.toLocaleLowerCase() === resolvedName.toLocaleLowerCase() || label.toLocaleLowerCase() === value.toLocaleLowerCase()));
        if (restoredMention) setRemovedPlaceMentionIds((current) => current.filter((mentionId) => mentionId !== restoredMention.mentionId));
      }
      if(builderEditSessionRef.current && selectedCommands.length && !dispatchAcceptedBuilderEdits(selectedCommands,{expectedInputRevision,acceptedInputs:!targetMentionId?[{binding:{kind:"destination-add"},raw:stopInput}]:undefined})) return fail("This place could not be retained safely. Your trip is preserved.");
      if(targetMentionId){
        setResolvingPlaceMentionId(null);
        setTransientPlanningMentionId(current=>current===targetMentionId?null:current);
        setBaseSearchInputs(current=>({...current,[targetMentionId]:''}));
        setBaseSearchErrors(current=>({...current,[targetMentionId]:''}));
      }
      if (!builderEditSessionRef.current) setDecisionSelections((current) => ({ ...current, routeOrder: undefined }));
      cancelCountryAddReview();setStopInput(""); setStopError(""); setStopChecking(false);
      if (targetMentionId) setShowStopEditor(false);
      else {
        setShowStopEditor(true);
        setStopSearchReadyKey((current) => current + 1);
      }
      return existingBase ?? addedStop;
    } catch {
      fail(ui.unavailable);
    } finally {
      if(lookupSequence===addPlaceLookupSequenceRef.current)setStopChecking(false);
    }
  };

  const addSupportedBase = (issue: PlaceIssue, option: PlaceIssueOption) => {
    const source = activeCapturedPlaceMentions.find(mention => mention.mentionId === issue.mentionId);
    if (source && requiresPhysicalIslandVerification(source)) {
      if (!option.country || !option.coordinates || !option.canonicalPlaceId) return;
      const suggestion: CanonicalPlaceSuggestion = {
        canonicalPlaceId: option.canonicalPlaceId, name: option.label, label: `${option.label}, ${option.country}`, country: option.country,
        placeType: option.placeType, coordinates: option.coordinates, routability: "direct_destination", provenance: option.provenance,
      };
      if (isOriginMention(source)) void selectOriginBase(source, suggestion);
      else void addStop(option.label, option.country, issue.mentionId, { kind: "base", selectedCanonicalPlaceId: option.canonicalPlaceId,
        selectedName: option.label, selectedPlaceType: option.placeType, selectedParentCountries: [option.country], provenance: option.provenance[0]! }, suggestion);
      return;
    }
    if (!option.country || !option.coordinates) {
      setResolvingPlaceMentionId(issue.mentionId);
      setShowStopEditor(true);
      setSummaryFocus("stops");
      return;
    }
    const optionCountry = option.country;
    const existingNamed = stops.find((stop) => isSameCanonicalPlace(stop, {
      name: option.label, country: optionCountry, canonicalPlaceId: option.canonicalPlaceId,
      coordinates: option.coordinates,
    }));
    const routeDestination = sourceRouteKey
      ? capturedStructuredBrief.destinations.find((destination) => destination.placeMentionId === issue.mentionId)
      : undefined;
    const routeStop = routeDestination?.id ? stops.find((stop) => stop.id === routeDestination.id) : undefined;
    const id = existingNamed?.id ?? routeStop?.id ?? `${option.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    rememberStructuralChange("select_regional_base", existingNamed ? 0 : 1);
    if(builderEditSessionRef.current) {
      const trip=builderEditSessionRef.current.getSnapshot().trip;
      const mention=activeCapturedPlaceMentions.find(item=>item.mentionId===issue.mentionId);
      const commands:BuilderAcceptedEdit[]=[];
      if(!existingNamed){const command=builderPlaceCommand(trip,{stopId:id,intentId:trip.brief.intent.route.destinations.some(i=>i.id===issue.mentionId)?issue.mentionId:undefined,
        place:{name:option.label,country:optionCountry,canonicalPlaceId:option.canonicalPlaceId,coordinates:option.coordinates}});if(!command)return;commands.push(command);}
      commands.push({kind:"planning-selection",selection:{mentionId:issue.mentionId,kind:mention?.routability==="anchor_or_poi"?"visit":"base",
        selectedCanonicalPlaceId:option.canonicalPlaceId,selectedName:option.label,selectedPlaceType:option.placeType,selectedParentCountries:[optionCountry],routeStopId:id,
        provenance:option.provenance[0]??{id:`builder:${issue.mentionId}:${id}`,label:"Traveller builder selection",kind:"builder",supports:"Selected this supported base."},
        ...(mention?.routability==="anchor_or_poi"?{relationshipType:"visit-from-base" as const}:{})}});
      dispatchAcceptedBuilderEdits(commands);return;
    }
    if (!existingNamed && routeStop) {
      setStops((current) => current.map((stop) => stop.id === routeStop.id ? {
        ...stop,
        name: option.label,
        country: optionCountry,
        canonicalPlaceId: option.canonicalPlaceId,
        coordinates: option.coordinates,
        intent: option.placeType === "landmark" || option.placeType === "natural_area" ? "landmark" : "place",
      } : stop));
    } else if (!existingNamed) setStops((current) => [...current, {
      id,
      name: option.label,
      country: optionCountry,
      canonicalPlaceId: option.canonicalPlaceId,
      coordinates: option.coordinates,
      intent: option.placeType === "landmark" || option.placeType === "natural_area" ? "landmark" : "place",
    }]);
    const targetMention = activeCapturedPlaceMentions.find((mention) => mention.mentionId === issue.mentionId);
    setPlaceSelections((current) => [{
      mentionId: issue.mentionId,
      kind: targetMention?.routability === "anchor_or_poi" ? "visit" : "base",
      selectedCanonicalPlaceId: option.canonicalPlaceId,
      selectedName: option.label,
      selectedPlaceType: option.placeType,
      selectedParentCountries: [optionCountry],
      routeStopId: id,
      provenance: option.provenance[0] ?? { id: `builder:${issue.mentionId}:${id}`, label: "Traveller builder selection", kind: "builder", supports: "The traveller selected this supported base." },
      ...(targetMention?.routability === "anchor_or_poi" ? { relationshipType: "visit-from-base" as const } : {}),
    }, ...current.filter((selection) => selection.mentionId !== issue.mentionId)]);
    setRemovedPlaceMentionIds((current) => current.filter((mentionId) => mentionId !== issue.mentionId));
    setDecisionSelections((current) => ({ ...current, routeOrder: undefined }));
  };

  const completePlanningArea = (mention: CapturedLocation, committedNow = false) => {
    if (!committedNow && !placeSelections.some((selection) => selection.mentionId === mention.mentionId && selection.routeStopId)) {
      setBaseSearchErrors((current) => ({
        ...current,
        [mention.mentionId]: language === "es"
          ? `Elige al menos un lugar en ${placeDisplayName(mention)}.`
          : `Choose at least one place in ${placeDisplayName(mention)}.`,
      }));
      return;
    }
    if(builderEditSessionRef.current) { if(!dispatchAcceptedBuilderEdit({kind:"planning-area",mentionId:mention.mentionId,action:"complete"})) return; }
    else setCompletedPlanningAreaMentionIds((current) => [...new Set([...current, mention.mentionId])]);
    setResolvingPlaceMentionId((current) => current === mention.mentionId ? null : current);
    setTransientPlanningMentionId((current) => current === mention.mentionId ? null : current);
    setBaseSearchInputs((current) => ({ ...current, [mention.mentionId]: "" }));
    setBaseSearchErrors((current) => ({ ...current, [mention.mentionId]: "" }));
    setShowStopEditor(false);
  };

  const removePlanningArea = (
    mention: CapturedLocation,
    plan: ReturnType<typeof builderClarificationRemovalPlan>,
  ) => {
    if (!plan.ownershipKnown) return;
    handoffLookupSessionRef.current?.handled.add(mention.mentionId);
    const removableStopIds = new Set(plan.removableStopIds);
    rememberStructuralChange("remove_requested_place", Math.max(1, removableStopIds.size));
    if(builderEditSessionRef.current) {
      const trip=builderEditSessionRef.current.getSnapshot().trip;
      const commands:BuilderAcceptedEdit[]= [...removableStopIds].map(id=>builderRemoveCommand(trip,id)).filter((edit):edit is BuilderAcceptedEdit=>edit!==null);
      if(commands.length !== removableStopIds.size) return;
      const parent=trip.brief.intent.route.destinations.find(intent=>intent.id===mention.mentionId);
      if(parent && !parent.stopIds.length) commands.push({kind:"remove-destination",intentId:parent.id});
      commands.push({kind:"planning-area",mentionId:mention.mentionId,action:"remove"});
      if(dispatchAcceptedBuilderEdits(commands)) {setTransientPlanningMentionId(null);advanceClarificationSession();}
      return;
    }
    setPlaceSelections((current) => current.filter((selection) => selection.mentionId !== mention.mentionId));
    setCompletedPlanningAreaMentionIds((current) => current.filter((id) => id !== mention.mentionId));
    setRemovedPlaceMentionIds((current) => [...new Set([...current, mention.mentionId])]);
    if (removableStopIds.size) {
      setStops((current) => current.filter((stop) => !removableStopIds.has(stop.id)));
      setDayAllocations((current) => Object.fromEntries(Object.entries(current).filter(([stopId]) => !removableStopIds.has(stopId))));
      setManualNightStopIds((current) => current.filter((stopId) => !removableStopIds.has(stopId)));
      setScheduleLocks((current) => ({
        stopIds: current.stopIds.filter((stopId) => !removableStopIds.has(stopId)),
        arrivalDates: Object.fromEntries(Object.entries(current.arrivalDates).filter(([stopId]) => !removableStopIds.has(stopId))),
      }));
      setDecisionSelections((current) => ({ ...current, routeOrder: undefined }));
    }
    setTransientPlanningMentionId((current) => current === mention.mentionId ? null : current);
    advanceClarificationSession();
  };

  const reopenPlanningArea = (mention: CapturedLocation) => {
    if(builderEditSessionRef.current && !dispatchAcceptedBuilderEdit({kind:"planning-area",mentionId:mention.mentionId,action:"reopen"})) return;
    setCompletedPlanningAreaMentionIds((current) => current.filter((mentionId) => mentionId !== mention.mentionId));
    setResolvingPlaceMentionId(null);
    setBaseSearchInputs((current) => ({ ...current, [mention.mentionId]: "" }));
    setClarificationSessionIds([mention.mentionId]);
    setClarificationIndex(0);
    setClarificationAutoOpened(true);
    setClarificationDismissed(false);
    setClarificationOpen(true);
  };

  const addGuidedPlanningPlace = (
    mention: CapturedLocation,
    suggestion: GuidedPlanningAreaSuggestion,
    discoverySelectionVerified = false,
  ) => addStop(suggestion.name, suggestion.country, mention.mentionId, undefined, {
    referenceSnapshotId: suggestion.referenceSnapshotId,
    canonicalPlaceId: suggestion.canonicalPlaceId,
    name: suggestion.name,
    label: `${suggestion.name}, ${suggestion.country}`,
    country: suggestion.country,
    // Only catalogue hierarchy may assert sub-region containment. The dialog
    // parent is context, never independent evidence of a child's location.
    region: findCatalogPlaceById(suggestion.canonicalPlaceId)?.parentRegionId,
    placeType: suggestion.placeType,
    coordinates: suggestion.coordinates,
    routability: "direct_destination",
    provenance: suggestion.provenance,
  }, discoverySelectionVerified);

  const applyGuidedPlanningShape = async (
    mention: CapturedLocation,
    shape: GuidedPlanningAreaShape,
  ) => {
    setApplyingAreaShapeId(shape.id);
    try {
      for (const suggestion of shape.places) {
        if (stops.some((stop) => stop.canonicalPlaceId === suggestion.canonicalPlaceId)) continue;
        await addGuidedPlanningPlace(mention, suggestion);
      }
    } finally {
      setApplyingAreaShapeId(null);
    }
  };

  const confirmAttractionVisit = (mention: CapturedLocation, proposal: AttractionVisitCandidate, routeStopId = proposal.target.routeStopId) => {
    const stop = stops.find((item) => item.id === routeStopId);
    if (!stop) return;
    handoffLookupSessionRef.current?.handled.add(mention.mentionId);
    rememberStructuralChange("confirm_attraction_visit_base", 0);
    const selection = confirmedAttractionVisitSelection(mention, proposal, {
      routeStopId: stop.id, name: stop.name, canonicalPlaceId: stop.canonicalPlaceId, country: stop.country,
    });
    if(builderEditSessionRef.current) { dispatchAcceptedBuilderEdit({kind:"planning-selection",selection}); return; }
    setPlaceSelections((current) => [selection, ...current.filter((item) => item.mentionId !== mention.mentionId)]);
    setRemovedPlaceMentionIds((current) => current.filter((mentionId) => mentionId !== mention.mentionId));
  };

  const choosePlaceIdentity = async (mention: CapturedLocation, canonicalPlaceId: string) => {
    const result: PlaceIntelligenceResult = {
      version: PLACE_INTELLIGENCE_VERSION,
      parserVersion: PLACE_INTELLIGENCE_PARSER_VERSION,
      sequenceKind: "unordered",
      mentions: capturedStructuredBrief.placeMentions ?? intakeMentions,
      issues: capturedStructuredBrief.placeIssues ?? [],
    };
    const selectedResult = selectPlaceCandidate(result, mention.mentionId, canonicalPlaceId);
    const selectedMention = selectedResult.mentions.find((item) => item.mentionId === mention.mentionId);
    if (!selectedMention || selectedMention.canonicalPlaceId !== canonicalPlaceId) return;
    if(builderEditSessionRef.current && !dispatchAcceptedBuilderEdit({kind:"planning-mention",action:"replace",mention:selectedMention,expectedMention:mention})) return;
    handoffLookupSessionRef.current?.handled.add(mention.mentionId);
    const nextBrief = extractStructuredTripBrief(tripBrief || capturedStructuredBrief.source.rawPrompt || "", selectedResult.parserVersion, selectedResult);
    setCapturedStructuredBrief(nextBrief);
    setIntakeMentions(selectedResult.mentions);
    if (selectedMention.routability === "direct_destination" && selectedMention.canonicalPlaceId) {
      await addStop(
        selectedMention.canonicalName,
        selectedMention.parentCountries.length === 1 ? selectedMention.parentCountries[0] : undefined,
        mention.mentionId,
        {
          kind: "ambiguity",
          selectedCanonicalPlaceId: selectedMention.canonicalPlaceId,
          selectedName: selectedMention.canonicalName,
          selectedPlaceType: selectedMention.placeType,
          selectedParentCountries: selectedMention.parentCountries,
          provenance: selectedMention.provenance[0] ?? { id: `builder:${mention.mentionId}:${selectedMention.canonicalPlaceId}`, label: "Traveller ambiguity selection", kind: "builder", supports: "The traveller selected this geographic identity." },
        },
      );
    }
  };

  const chooseProviderClarification = async (mention: CapturedLocation, choice: LocationChoice) => {
    if (requiresPhysicalIslandVerification(mention)) {
      const snapshot = builderEditSessionRef.current?.getSnapshot();
      if (!snapshot || !providerClarificationScope || snapshot.trip.id !== providerClarificationScope.tripId
        || snapshot.browserOwnerId !== providerClarificationScope.ownerId || activeBrowserOwnerIdRef.current !== providerClarificationScope.ownerId
        || snapshot.inputRevision !== providerClarificationScope.revision || mention.mentionId !== providerClarificationScope.mentionId) return;
      const canonicalPlaceId = choice.canonicalPlaceId ?? (choice.providerId ? `open-world:${choice.providerId}` : undefined);
      if (!canonicalPlaceId || !choice.coordinates || !choice.country || (choice.placeType !== "city" && choice.placeType !== "town")) return;
      const suggestion: CanonicalPlaceSuggestion = { canonicalPlaceId, name: choice.name, label: `${choice.name}, ${choice.country}`,
        country: choice.country, region: choice.region, placeType: choice.placeType, coordinates: choice.coordinates, routability: "direct_destination",
        ...(choice.referenceSnapshotId ? { referenceSnapshotId: choice.referenceSnapshotId } : {}),
        provenance: choice.providerId ? [{ id: choice.providerId, label: "Settlement geography", kind: "provider", supports: "Traveller-selected settlement." }] : [] };
      const accepted = isOriginMention(mention) ? await selectOriginBase(mention, suggestion)
        : await addStop(choice.name, choice.country, mention.mentionId, undefined, suggestion);
      if (!accepted) return;
      setLocationChoices(current => current.filter(item => item.mention.mentionId !== mention.mentionId));
      advanceClarificationSession();
      return;
    }
    if(builderEditSessionRef.current) {
      const snapshot=builderEditSessionRef.current.getSnapshot(),trip=snapshot.trip;
      if(!providerClarificationScope || snapshot.trip.id!==providerClarificationScope.tripId
        || snapshot.browserOwnerId!==providerClarificationScope.ownerId
        || activeBrowserOwnerIdRef.current!==providerClarificationScope.ownerId
        || snapshot.inputRevision!==providerClarificationScope.revision
        || mention.mentionId!==providerClarificationScope.mentionId)return;
      const place=acceptedGeographicPlace({name:choice.name,country:choice.country,canonicalPlaceId:choice.canonicalPlaceId??(choice.providerId?`open-world:${choice.providerId}`:undefined),providerId:choice.providerId,coordinates:choice.coordinates},choice,isOriginMention(mention)?'endpoint':'stop');
      if(!place)return;
      const intent=trip.brief.intent.route.destinations.find(i=>i.id===mention.mentionId);
      const id=intent?.stopIds.length===1?intent.stopIds[0]!:handoffStopOccurrenceId(mention,handoffOccurrenceMentionIdsRef.current);
      let beforeStopId:string|undefined;
      if(!isOriginMention(mention)&&!trip.stops.some(stop=>stop.id===id)){
        try{
          const positioned=insertHandoffOccurrence(trip.stops.map(stop=>({id:stop.id})),{id},mention,
            trip.brief.structuredBrief?.placeMentions??intakeMentions,handoffCanonicalOccurrenceBindings(trip.brief.intent.route,handoffOccurrenceMentionIdsRef.current),trip.brief.intent.route.orderAuthority);
          beforeStopId=positioned[positioned.findIndex(stop=>stop.id===id)+1]?.id;
        }catch{setBaseSearchErrors(current=>({...current,[mention.mentionId]:'The route order changed. Review this place’s position.'}));return;}
      }
      const command=isOriginMention(mention)?{kind:"origin" as const,place}:builderPlaceCommand(trip,{stopId:id,intentId:intent?.id,place,beforeStopId});
      if(!command)return;
      const commands:BuilderAcceptedEdit[]=[command];
      if(!isOriginMention(mention)&&intent&&place.canonicalPlaceId)commands.push({kind:'planning-selection',selection:{
        mentionId:mention.mentionId,kind:'ambiguity',selectedCanonicalPlaceId:place.canonicalPlaceId,
        selectedName:place.name,selectedPlaceType:choice.placeType==='city'?'city':'town',selectedParentCountries:[choice.country],routeStopId:id,
        provenance:{id:`builder:${mention.mentionId}:${id}`,label:'Traveller provider selection',kind:'builder',supports:'The traveller explicitly confirmed this geographic identity.'},
      }});
      if(!dispatchAcceptedBuilderEdits(commands,{expectedInputRevision:providerClarificationScope.revision}))return;
      handoffLookupSessionRef.current?.handled.add(mention.mentionId);
      handoffLookupSessionRef.current?.statuses.set(mention.mentionId,'resolved');
      setHandoffResolutionStatuses(current=>({...current,[mention.mentionId]:'resolved'}));
      setLocationChoices(current=>current.filter(item=>item.mention.mentionId!==mention.mentionId));advanceClarificationSession();return;
    }
    handoffLookupSessionRef.current?.handled.add(mention.mentionId);
    if (isOriginMention(mention)) {
      replaceJourneyOrigin({
        name: choice.name,
        coordinates: choice.coordinates,
        // A traveller's selected provider choice replaces the prior mention;
        // its canonical identity must not inherit the old mention's ID.
        canonicalPlaceId: choice.canonicalPlaceId ?? (choice.providerId ? `open-world:${choice.providerId}` : undefined),
        country: choice.country,
        providerId: choice.providerId,
      });
    } else {
      const canonicalPlaceId = choice.canonicalPlaceId ?? (choice.providerId ? `open-world:${choice.providerId}` : undefined) ?? mention.canonicalPlaceId;
      const stopId = handoffStopOccurrenceId(mention, handoffOccurrenceMentionIdsRef.current);
      setStops((current) => insertHandoffOccurrence(current, {
          id: stopId,
          name: choice.name,
          country: choice.country,
          canonicalPlaceId,
          countryCode: choice.countryCode,
          region: choice.region,
          providerId: choice.providerId,
          coordinates: choice.coordinates,
          intent: "place",
          locality: choice.locality,
        }, mention, capturedStructuredBrief.placeMentions ?? intakeMentions, handoffOccurrenceMentionIdsRef.current));
    }
    setLocationChoices((current) => current.filter((item) => item.mention.mentionId !== mention.mentionId));
    advanceClarificationSession();
  };

  const applyTripBrief = async (signal: AbortSignal, isCurrent: () => boolean, brief = tripBrief, onResponse?: () => void) => {
    if (!brief.trim()) return;
    const capture = await requestJourneyCapture(brief, { signal, onResponse });
    if (!isCurrent()) return;
    setTripBrief(brief);
    setCapturedStructuredBrief(capture.structuredBrief);
    setPlanningSuggestions(capture.planningSuggestions ?? []);
    setIntakeMentions(capture.mentions);
    setPlaceSelections([]);
    setCompletedPlanningAreaMentionIds([]);
    setRemovedPlaceMentionIds([]);

    setHasPromptContext(true);

    setRouteHints(capture.routeHints);
    const capturedTransportModes = capture.structuredBrief.transportPreferences
      .map((preference) => preference.value)
      .filter((mode): mode is TripTransportMode => mode === "flight" || mode === "train" || mode === "drive");
    const capturedInterests = normalizeTripInterests(capture.structuredBrief.interests.map((interest) => interest.value));
    const capturedJourneyEnd = newTripCapturedJourneyEnd(brief, capture.journeyEnd);
    if (!journeyEndTouched) {
      setJourneyEnd(capturedJourneyEnd);
      setJourneyEndInput(capturedJourneyEnd.mode === "explicit" ? capturedJourneyEnd.place.name : "");
    }

    setTripIntent((current) => ({
      ...current,
      journeyEnd: journeyEndTouched ? current.journeyEnd : capturedJourneyEnd,
      travellers: capture.structuredBrief.travellers ? Math.max(1, Math.min(12, capture.structuredBrief.travellers.value)) : current.travellers,
      preferences: {
        ...current.preferences,
        transportModes: capturedTransportModes.length ? capturedTransportModes : current.preferences.transportModes,
        pace: capture.structuredBrief.pace?.value ?? current.preferences.pace,
        interests: capturedInterests.length ? capturedInterests : current.preferences.interests,
      },
      hardConstraints: { ...current.hardConstraints, avoidDriving: capture.structuredBrief.hardConstraints.some((constraint) => constraint.type === "no-driving") || current.hardConstraints.avoidDriving },
    }));

    const capturedOrigin = capture.mentions.find(isOriginMention);
    if (!origin.trim() && capturedOrigin) {
      replaceJourneyOrigin({
        name: capturedOrigin.canonicalName,
        coordinates: capturedOrigin.coordinates,
        canonicalPlaceId: capturedOrigin.canonicalPlaceId,
        country: capturedOrigin.parentCountries.length === 1 ? capturedOrigin.parentCountries[0] : undefined,
      });
      setOriginTouched(true);
    }

    if (!stops.length) {
      setStops(routableHandoffMentions(capture.mentions)
        .filter((mention) => !isOriginMention(mention))
        .map((mention) => ({
          id: `${mention.canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${mention.order}`,
          name: mention.canonicalName,
          country: mention.parentCountries.length === 1 ? mention.parentCountries[0] : "",
          canonicalPlaceId: mention.canonicalPlaceId,
          coordinates: mention.coordinates,
          intent: "place" as const,
        })));
    }

    // Respect dates the traveller has actually edited. A saved, unconfirmed
    // draft is still a draft: applying a new brief should make its stated
    // duration visible rather than quietly retaining an old seven-day range.
    if (capture.durationDays && !datesManuallyEdited) {
      const date = new Date(`${startDate}T00:00:00`);
      date.setDate(date.getDate() + Math.max(1, capture.durationDays - 1));
      setEndDate(iso(date));
      setEndDateStillSuggested(false);
    }
  };

  const submitInitialTripBrief = async () => {
    const captureBrief = tripBrief;
    if (!captureBrief.trim()) return;
    setApplyingTripBrief(true);
    setTripBriefCaptureError("");
    const captureRequest = captureRequestGateRef.current!.begin();
    let responseReceived = false;
    try {
      await applyTripBrief(captureRequest.signal, captureRequest.isCurrent, captureBrief, () => { responseReceived = true; });
      if (!captureRequest.isCurrent()) return;
    } catch {
      if (!captureRequest.isCurrent()) return;
      setTripBriefCaptureError(journeyCaptureFailureMessage(responseReceived ? "interpretation" : "network", language));
    } finally {
      if (captureRequest.isCurrent()) setApplyingTripBrief(false);
      captureRequest.finish();
    }
  };

  const canMoveStop = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= stops.length || to >= stops.length) return false;
    const moved = stops[from];
    return !scheduleLocks.stopIds.includes(moved.id)
      && !stops.slice(Math.min(from, to), Math.max(from, to) + 1).some((stop) => scheduleLocks.stopIds.includes(stop.id));
  };

  const commitStopOrder = useCallback((proposedIds: readonly string[], source: BuilderOrderSource) => {
    const result = validateBuilderStopOrder(stops, proposedIds, {
      lockedStopIds: protectedBuilderStopIds,
      fixedOrder: fixedBuilderChronology,
    });
    if (!result.ok) return false;
    rememberStructuralChange(source === "route-check" ? "apply_route_order" : "reorder_stop", stops.length);
    if (builderEditSessionRef.current) {
      const accepted = dispatchAcceptedBuilderEdit({ kind: "order", stopIds: result.ids, source });
      if (accepted) { setRoutePreviewStopIds(null); setKeptRouteKey(null); }
      return accepted;
    }
    setStops(result.stops);
    setTripIntent((current) => {
      const route = routeIntentFromHandoff({ routeIntent: current.route, origin, journeyEnd, structuredBrief: effectiveStructuredBrief, brief: tripBrief },
        stops.map((stop, order) => ({ ...stop, order, latitude: stop.coordinates?.[1] ?? null, longitude: stop.coordinates?.[0] ?? null,
          arrivalDate: null, departureDate: null, nights: allocation[stop.id] ?? null })));
      return { ...current, route: routeIntentForAcceptedBuilderOrder(route, result.ids, source) };
    });
    const appliedRecommendedOrder = source === "route-check"
      && proposedIds.join("\u001f") === routeIntelligence.route.recommendedStopIds.join("\u001f");
    setDecisionSelections((current) => ({ ...current, routeOrder: appliedRecommendedOrder ? "recommended" : "entered" }));
    if (source === "route-check") {
      setKeptRouteKey(null);
    }
    setRoutePreviewStopIds(null);
    return true;
  }, [routeIntelligence.route.recommendedStopIds, protectedBuilderStopIds, fixedBuilderChronology, stops, origin, journeyEnd, effectiveStructuredBrief, tripBrief, allocation]);

  const moveStop = (from: number, to: number) => {
    if (!canMoveStop(from, to)) return;
    const ids = stops.map((stop) => stop.id);
    const [moving] = ids.splice(from, 1);
    ids.splice(to, 0, moving);
    commitStopOrder(ids, "move-menu");
  };

  const applyRouteCheckProposal = () => {
    if (!currentRouteCheckProposalStopIds || routeIntelligence.route.state !== "recommendation") return;
    if (scheduleLocks.stopIds.length || Object.keys(scheduleLocks.arrivalDates).length || structuredRouteConstraints.fixedCommitments?.length) return;
    if (!commitStopOrder(currentRouteCheckProposalStopIds, "route-check")) return;
    if (!builderEditSessionRef.current) setDecisionSelections((current) => ({ ...current, routeOrder: "recommended" }));
    setKeptRouteKey(null);
    setRouteCheckProposalStopIds(null);
    trackEvent("route_accepted", { method: "recommended_order", stop_count: stops.length, duration_days: totalDays });
  };

  const requestRouteOptimization=async()=>{
    const editor=builderEditSessionRef.current;if(!editor)return;
    const source=editor.getSnapshot();const scope={ownerId:source.browserOwnerId,tripId:source.trip.id,inputRevision:source.inputRevision};
    const end = source.trip.brief.intent.route.journeyEnd;
    if(source.trip.stops.some(stop=>!geographicallyReady(stopGeographicPlace(stop)))||!geographicallyReady(source.trip.brief.intent.route.origin,'endpoint')
      || end.mode === 'explicit' && !geographicallyReady(end.place, 'endpoint')){
      setOptimizationResult({kind:'unavailable',reason:'insufficient-data'});return;
    }
    const inputKey=routeProjectionInputKey(source.trip),request=optimizationGateRef.current!.begin();
    setOptimizationChecking(true);setOptimizationResult(null);setOptimizationError("");
    try{
      const result=await Promise.resolve().then(()=>calculateBuilderOptimization(source.trip,scope,`${source.trip.id}:${scope.inputRevision}:${Date.now()}`));
      const latest=editor.getSnapshot();
      if(!request.isCurrent()||builderEditSessionRef.current!==editor||latest.browserOwnerId!==scope.ownerId||latest.inputRevision!==scope.inputRevision||routeProjectionInputKey(latest.trip)!==inputKey)return;
      setOptimizationResult(result);
    }catch{if(request.isCurrent()){setOptimizationResult({kind:"unavailable",reason:"insufficient-data"});}}
    finally{if(request.isCurrent())setOptimizationChecking(false);request.finish();}
  };
  const keepOptimizationOrder=()=>{optimizationGateRef.current?.cancel();setOptimizationResult(null);setOptimizationError("");setOptimizationChecking(false);};
  const acceptRouteOptimization=()=>{
    const editor=builderEditSessionRef.current;if(!editor||!optimizationProposal)return;
    const source=editor.getSnapshot(),scope={ownerId:source.browserOwnerId,tripId:source.trip.id,inputRevision:source.inputRevision};
    const result=acceptBuilderOptimization(source.trip,optimizationProposal,scope);
    if(!result.ok){setOptimizationError(language==="es"?"El viaje ha cambiado. Revisa la ruta actual.":"The trip changed. Review the current route.");return;}
    rememberStructuralChange("apply_route_order",source.trip.stops.length);
    if(!dispatchAcceptedBuilderEdit(result.command,{expectedInputRevision:optimizationProposal.inputRevision})){
      setOptimizationError(language==="es"?"No pudimos aplicar este orden. Tu ruta actual sigue guardada.":"We could not apply this order. Your current route remains preserved.");return;
    }
    keepOptimizationOrder();setKeptRouteKey(null);
    trackEvent("route_accepted",{method:"recommended_order",stop_count:source.trip.stops.length,duration_days:totalDays});
  };

  const applyScoredRouteCandidate = (candidateIndex: number, stopIds: string[]) => {
    if (scheduleLocks.stopIds.length || Object.keys(scheduleLocks.arrivalDates).length || structuredRouteConstraints.fixedCommitments?.length) return;
    const candidate = routeIntelligence.route.candidates?.find((item) => item.metadata.candidateIndex === candidateIndex);
    const score = routeIntelligence.route.scoring?.rankedCandidates.find((item) => item.candidateIndex === candidateIndex);
    if (!candidate?.constraintsSatisfied || score?.state !== "scored") return;
    const nextStops = stopIds.map((id) => stops.find((stop) => stop.id === id)).filter((stop): stop is Stop => Boolean(stop));
    if (nextStops.length !== stops.length || new Set(nextStops.map((stop) => stop.id)).size !== stops.length) return;
    if (!commitStopOrder(nextStops.map((stop) => stop.id), "route-check")) return;
    if(!builderEditSessionRef.current) setDecisionSelections((current) => ({
      ...current,
      routeOrder: stopIds.join("\u001f") === routeIntelligence.route.recommendedStopIds.join("\u001f") ? "recommended" : "entered",
    }));
    setKeptRouteKey(null);
    setTimingWarningOpen(false);
    trackEvent("route_accepted", { method: "scored_warning_alternative", stop_count: stops.length, duration_days: totalDays, has_recommendation: true });
  };

  const acceptCurrentRoute = (method: "continue" | "keep_order") => {
    if(builderEditSessionRef.current) return;
    if (!hasAnalyticsConsent()) {
      setDecisionSelections((current) => ({ ...current, routeOrder: method === "keep_order" ? "entered" : current.routeOrder ?? "entered" }));
      return;
    }
    const key = `morrovia:route-accepted:${tripId}:${routeKey}`;
    if (window.localStorage.getItem(key)) return;
    trackEvent("route_accepted", { method, stop_count: stops.length, duration_days: totalDays, has_recommendation: routeIntelligence.route.state === "recommendation" });
    window.localStorage.setItem(key, "1");
    setDecisionSelections((current) => ({ ...current, routeOrder: method === "keep_order" ? "entered" : current.routeOrder ?? "entered" }));
  };

  const updateIntentPreferences = (update: Partial<TripIntent["preferences"]>) => {
    if (update.pace !== undefined) setPaceManuallyEdited(true);
    if (update.interests !== undefined) setInterestsManuallyEdited(true);
    if (builderEditSessionRef.current) {
      dispatchAcceptedBuilderEdit({ kind: "preferences", preferences: update });
      return;
    }
    setTripIntent((current) => ({ ...current, preferences: { ...current.preferences, ...update } }));
  };

  const updateBuilderConstraints = (constraints: Partial<Pick<TripIntent["hardConstraints"], "optionalStopIds" | "fixedCommitments" | "avoidDriving">>) => {
    if (builderEditSessionRef.current) return dispatchAcceptedBuilderEdit({ kind: "constraints", constraints });
    setTripIntent(current => ({ ...current, hardConstraints: { ...current.hardConstraints, ...constraints } }));
    return true;
  };
  const updateTimingFlexibility = (flexibility: "fixed" | "flexible") => {
    if (builderEditSessionRef.current) return dispatchAcceptedBuilderEdit({ kind: "timing-flexibility", flexibility });
    setTripIntent(current => ({ ...current, timing: { ...current.timing, flexibility } }));
    return true;
  };
  const toggleOptionalStop = (stopId: string) => {
    const nextIds = (ids: string[]) => ids.includes(stopId) ? ids.filter(id => id !== stopId) : [...ids, stopId];
    if (builderEditSessionRef.current) return updateBuilderConstraints({ optionalStopIds: nextIds(builderEditSessionRef.current.getSnapshot().trip.brief.intent.hardConstraints.optionalStopIds) });
    setTripIntent(current => ({ ...current, hardConstraints: { ...current.hardConstraints, optionalStopIds: nextIds(current.hardConstraints.optionalStopIds) } }));
    return true;
  };
  const removeFixedCommitment = (commitmentId: string) => {
    if (builderEditSessionRef.current) return updateBuilderConstraints({ fixedCommitments: builderEditSessionRef.current.getSnapshot().trip.brief.intent.hardConstraints.fixedCommitments.filter(item => item.id !== commitmentId) });
    setTripIntent(current => ({ ...current, hardConstraints: { ...current.hardConstraints, fixedCommitments: current.hardConstraints.fixedCommitments.filter(item => item.id !== commitmentId) } }));
    return true;
  };
  const addFixedCommitment = () => {
    const label = fixedCommitmentLabel.trim();
    if (!label) return;
    const suggestion = canonicalPlaceSuggestionFor(label);
    const commitment: FixedTripCommitment = {
      id: `fixed-${Date.now()}`,
      label,
      date: fixedCommitmentDate || undefined,
      commitmentType: "fixed-date",
      place: suggestion ? {
        name: suggestion.name,
        canonicalPlaceId: suggestion.canonicalPlaceId,
        country: suggestion.country,
        coordinates: suggestion.coordinates,
      } : { name: label },
    };
    if (builderEditSessionRef.current) {
      const currentIntent = builderEditSessionRef.current.getSnapshot().trip.brief.intent;
      if (!updateBuilderConstraints({ fixedCommitments: [...currentIntent.hardConstraints.fixedCommitments, commitment] })) return;
    } else setTripIntent(current => ({ ...current, hardConstraints: { ...current.hardConstraints, fixedCommitments: [...current.hardConstraints.fixedCommitments, commitment] } }));
    setFixedCommitmentLabel("");
    setFixedCommitmentDate("");
  };

  const selectOriginSuggestion = async (suggestion: CanonicalPlaceSuggestion) => {
    if (placeSuggestionRequiresBaseSelection(suggestion)) {
      beginPlanningAreaClarification(suggestion, "origin");
      return false;
    }
    const selection = journeyEndpointPlaceFromSuggestion(suggestion);
    if(!selection){setOriginError(ui.verifyOrigin);return false;}
    const resolutionVersion = originResolutionVersionRef.current + 1;
    if (builderEditSessionRef.current) {
      const state = builderEditSessionRef.current.getSnapshot();
      const raw = state.draft.fields.find(field => field.binding.kind === "origin");
      if (!dispatchAcceptedBuilderEdit({ kind: "origin", place: selection }, { expectedInputRevision: state.inputRevision,
        ...(raw ? { acceptedInput: { binding: { kind: "origin" }, raw: raw.raw } } : {}) })) return false;
    } else replaceJourneyOrigin(selection);
    const enrichmentRevision = builderEditSessionRef.current?.getSnapshot().inputRevision;
    setOriginTouched(true);
    setOriginError("");
    if (suggestion.coordinates) {
      return true;
    }
    try {
      const response = await fetch(`/api/journey-geocode?place=${encodeURIComponent(suggestion.name)}&country=${encodeURIComponent(suggestion.country)}`);
      const payload = await response.json() as { result?: LocationChoice | null };
      if (originResolutionVersionRef.current !== resolutionVersion
        || (builderEditSessionRef.current && builderEditSessionRef.current.getSnapshot().inputRevision !== enrichmentRevision)) return false;
      if (!payload.result?.coordinates || !canonicalPlaceFactsMatch(suggestion.canonicalPlaceId, payload.result)) {
        if (!builderEditSessionRef.current) replaceJourneyOrigin(selection);
        setOriginError(ui.verifyOrigin);
        return false;
      }
      const enriched = acceptedGeographicPlace(selection,payload.result,'endpoint');
      if(!enriched){setOriginError(ui.verifyOrigin);return false;}
      if (builderEditSessionRef.current) {
        return dispatchAcceptedBuilderEdit({ kind: "origin", place: enriched }, { expectedInputRevision: enrichmentRevision });
      }
      replaceJourneyOrigin(enriched);
      return true;
    } catch {
      if (originResolutionVersionRef.current !== resolutionVersion
        || (builderEditSessionRef.current && builderEditSessionRef.current.getSnapshot().inputRevision !== enrichmentRevision)) return false;
      if (!builderEditSessionRef.current) replaceJourneyOrigin(selection);
      setOriginError(ui.originUnavailable);
      return false;
    }
  };

  const changeJourneyEndInput = (value: string) => {
    journeyEndResolutionVersionRef.current += 1;
    setJourneyEndTouched(true);
    setJourneyEndInput(value);
    setJourneyEndError("");
    setJourneyEndResolutionAttempted(false);
    setJourneyEnd(value.trim() ? { mode: "explicit", place: { name: value.trim() } } : { mode: "unknown" });
  };

  const selectJourneyEndSuggestion = (suggestion: CanonicalPlaceSuggestion) => {
    const place=journeyEndpointPlaceFromSuggestion(suggestion);if(!place)return;
    journeyEndResolutionVersionRef.current += 1;
    setJourneyEndTouched(true);
    setJourneyEndInput(suggestion.name);
    setJourneyEndError("");
    setJourneyEndResolutionAttempted(true);
    setJourneyEnd({
      mode: "explicit",
      place,
    });
  };

  const chooseJourneyEndMode = (mode: "same_as_start" | "unknown") => {
    if (builderEditSessionRef.current) {
      dispatchAcceptedBuilderEdit({ kind: "type", tripType: mode === "same_as_start" ? "return_to_start" : "one_way" });
      return;
    }
    journeyEndResolutionVersionRef.current += 1;
    setJourneyEndTouched(true);
    setJourneyEndInput("");
    setJourneyEndError("");
    setJourneyEndResolutionAttempted(true);
    setJourneyEnd({ mode });
  };

  const selectOriginBase = async (mention: CapturedLocation, suggestion: CanonicalPlaceSuggestion) => {
    const snapshot = builderEditSessionRef.current?.getSnapshot();
    if (requiresPhysicalIslandVerification(mention)) {
      if (!snapshot) return false;
      const version = ++originResolutionVersionRef.current;
      const verified = await verifyPhysicalIslandSuggestion(planningParentForMention(mention), suggestion);
      const current = builderEditSessionRef.current?.getSnapshot();
      if (!current || originResolutionVersionRef.current !== version || current.trip.id !== snapshot.trip.id
        || current.browserOwnerId !== snapshot.browserOwnerId || activeBrowserOwnerIdRef.current !== snapshot.browserOwnerId
        || current.inputRevision !== snapshot.inputRevision || !current.trip.brief.structuredBrief?.placeMentions?.some(source => source.mentionId === mention.mentionId)) return false;
      if (!verified) { setBaseSearchErrors(errors => ({ ...errors, [mention.mentionId]: language === "es"
        ? `No pudimos verificar esta base dentro de ${placeDisplayName(mention)}. Se conserva tu intención original.`
        : `We couldn't independently verify this base inside ${placeDisplayName(mention)}. Your original intent is preserved.` })); return false; }
      suggestion = verified;
    }
    if (placeSuggestionRequiresBaseSelection(suggestion) || !placeCandidateWithinPlanningParent({
      canonicalName: suggestion.name,
      placeType: suggestion.placeType,
      parentCountries: [suggestion.country],
      parentRegionId: suggestion.region,
      coordinates: suggestion.coordinates,
    }, planningParentForMention(mention))) {
      setBaseSearchErrors((current) => ({
        ...current,
        [mention.mentionId]: language === "es"
          ? `${suggestion.name} no está dentro de ${placeDisplayName(mention)}.`
          : `${suggestion.name} is not inside ${placeDisplayName(mention)}.`,
      }));
      return false;
    }
    if(builderEditSessionRef.current && suggestion.coordinates) {
      const selection:PlaceSelection={mentionId:mention.mentionId,kind:"base",selectedCanonicalPlaceId:suggestion.canonicalPlaceId,
        selectedName:suggestion.name,selectedPlaceType:suggestion.placeType,selectedParentCountries:[suggestion.country],
        provenance:suggestion.provenance[0]??{id:`builder-origin-base:${mention.mentionId}:${suggestion.canonicalPlaceId}`,label:"Traveller builder selection",kind:"builder",supports:"Selected the departure point within this area."}};
      const place=journeyEndpointPlaceFromSuggestion(suggestion);if(!place)return false;
      if(!dispatchAcceptedBuilderEdits([{kind:"origin",place},{kind:"planning-selection",selection}], { expectedInputRevision: requiresPhysicalIslandVerification(mention) ? snapshot?.inputRevision : undefined })) return false;
      setOriginPlanningMentionId(null);originBeforePlanningClarificationRef.current=null;setTransientPlanningMentionId(null);
      setBaseSearchInputs(current=>({...current,[mention.mentionId]:""}));setBaseSearchErrors(current=>({...current,[mention.mentionId]:""}));return true;
    }
    const selected = await selectOriginSuggestion(suggestion);
    if (!selected) return false;
    setPlaceSelections((current) => [{
      mentionId: mention.mentionId,
      kind: "base",
      selectedCanonicalPlaceId: suggestion.canonicalPlaceId,
      selectedName: suggestion.name,
      selectedPlaceType: suggestion.placeType,
      selectedParentCountries: [suggestion.country],
      provenance: suggestion.provenance[0] ?? {
        id: `builder-origin-base:${mention.mentionId}:${suggestion.canonicalPlaceId}`,
        label: "Traveller builder selection",
        kind: "builder",
        supports: `The traveller selected ${suggestion.name} as the departure point within ${placeDisplayName(mention)}.`,
      },
    }, ...current.filter((selection) => selection.mentionId !== mention.mentionId)]);
    setOriginPlanningMentionId(null);
    originBeforePlanningClarificationRef.current = null;
    setTransientPlanningMentionId((current) => current === mention.mentionId ? null : current);
    setBaseSearchInputs((current) => ({ ...current, [mention.mentionId]: "" }));
    setBaseSearchErrors((current) => ({ ...current, [mention.mentionId]: "" }));
    return true;
  };

  const validateOrigin = async () => {
    if (!origin.trim()) { setOriginTouched(true); setOriginError(ui.addOrigin); return false; }
    if (journeyEndpointIdentityIsCoherent(journeyOrigin)) return true;
    const resolutionVersion = originResolutionVersionRef.current + 1;
    replaceJourneyOrigin({ name: origin.trim() });
    try {
      const response = await fetch(`/api/journey-geocode?place=${encodeURIComponent(origin.trim())}&candidates=1`);
      const payload = await response.json() as { candidates?: LocationChoice[] };
      if (originResolutionVersionRef.current !== resolutionVersion) return false;
      const resolution = resolveTypedJourneyEndpoint(origin.trim(), payload.candidates ?? []);
      if (resolution.status !== "resolved") {
        setOriginTouched(true);
        setOriginError(resolution.status === "ambiguous"
          ? (language === "es" ? "Elige qué punto de partida quieres decir." : "Choose which starting place you mean.")
          : ui.verifyOrigin);
        if (resolution.status === "ambiguous") setStartRevealSuggestionsKey((current) => current + 1);
        return false;
      }
      replaceJourneyOrigin(resolution.place);
      setOriginError("");
      return true;
    } catch {
      setOriginError(ui.originUnavailable);
      return false;
    }
  };

  const validateJourneyEnd = async () => {
    if (journeyEnd.mode !== "explicit") return true;
    if (journeyEndpointIdentityIsCoherent(journeyEnd.place)) return true;
    const input = journeyEndInput.trim() || journeyEnd.place.name.trim();
    if (!input) return true;
    const resolutionVersion = journeyEndResolutionVersionRef.current + 1;
    journeyEndResolutionVersionRef.current = resolutionVersion;
    setJourneyEndResolutionAttempted(true);
    try {
      const response = await fetch(`/api/journey-geocode?place=${encodeURIComponent(input)}&candidates=1`);
      const payload = await response.json() as { candidates?: LocationChoice[] };
      if (journeyEndResolutionVersionRef.current !== resolutionVersion) return false;
      const resolution = resolveTypedJourneyEndpoint(input, payload.candidates ?? []);
      if (resolution.status !== "resolved") {
        setJourneyEndError(resolution.status === "ambiguous"
          ? (language === "es" ? "Elige qué lugar de llegada quieres decir." : "Choose which ending place you mean.")
          : (language === "es" ? "No pudimos verificar ese lugar de llegada." : "We couldn't verify that ending place."));
        if (resolution.status === "ambiguous") setEndRevealSuggestionsKey((current) => current + 1);
        return false;
      }
      setJourneyEndInput(resolution.place.name);
      setJourneyEnd({ mode: "explicit", place: resolution.place });
      setJourneyEndError("");
      return true;
    } catch {
      if (journeyEndResolutionVersionRef.current !== resolutionVersion) return false;
      setJourneyEndError(language === "es" ? "No pudimos comprobar ese lugar de llegada ahora." : "We couldn't check that ending place just now.");
      return false;
    }
  };
  const togglePick = (stopId: string, title: string) => {
    if (builderEditSessionRef.current) {
      const current = builderEditSessionRef.current.getSnapshot().trip.brief.selectedPlaces?.[stopId] ?? [];
      dispatchAcceptedBuilderEdit({ kind: "picks", stopId, titles: current.includes(title) ? current.filter(item => item !== title) : [...current, title] });
      return;
    }
    const current = picks[stopId] ?? [];
    setPicks({ ...picks, [stopId]: current.includes(title) ? current.filter((t) => t !== title) : [...current, title] });
  };

  /** Selected real places are grouped into achievable days; each move gets a visible estimate. */
  const draft = useMemo<PlannedDay[]>(() => placeReviewReady ? buildCredibleItinerary({
    origin,
    originCoordinates,
    stops,
    startDate,
    allocations: calendarDayAllocations,
    picks: effectivePicks,
    places: Object.fromEntries(stops.map((stop) => [stop.id, placesFor(stop, discoveredPlaces)])),
    constraints: structuredRouteConstraints,
  }) : [], [placeReviewReady, origin, originCoordinates, stops, startDate, calendarDayAllocations, effectivePicks, discoveredPlaces, structuredRouteConstraints]);

  const activeTripDocument = useMemo(() => {
    if (canonicalBuilder) return canonicalBuilder;
    const built = tripFromBuilder({
      id: tripId,
      sourceRouteKey,
      curatedRoute: currentCuratedRoute,
      origin,
      originCanonicalPlaceId,
      originCountry,
      originProviderId,
      journeyEnd,
      stops,
      startDate,
      endDate,
      endDateIsSuggestion: endDateStillSuggested,
      picks: effectivePicks,
      mustDo: tripBrief,
      pace: effectiveIntent.preferences.pace === "packed" ? "full" : "slow",
      hotels: "few",
      budget,
      budgetPreference,
      dayAllocations: calendarDayAllocations,
      nightAllocations: allocation,
      manualNightStopIds,
      nightAllocation,
      // New routes use the canonical flexible calendar. Recommendations are
      // generated context, not authored day protection. Saved documents and
      // reviewed templates keep their existing day owner.
      draft: sourceRouteKey || hydratedCanonicalTripRef.current?.id === tripId ? draft : [],
      placeDetails: discoveredPlaces,
      originCoordinates,
      createdAt,
      status: tripStatus === "archived" ? "draft" : tripStatus,
      capturedIntent: intakeMentions.length ? {
        originalBrief: tripBrief,
        parserVersion: effectiveStructuredBrief.source.parserVersion,
        regions: effectiveStructuredBrief.preferredRegions.map((region) => region.value),
        routeHints,
        mentions: activePlaceMentions.map((mention) => ({
          sourceText: mention.sourceText,
          canonicalName: mention.canonicalName,
          canonicalPlaceId: mention.canonicalPlaceId,
          placeType: mention.placeType,
          role: isOriginMention(mention) ? "origin" as const : isEndMention(mention) ? "end" as const : "stop" as const,
          order: mention.order,
          status: mention.status === "resolved" && mention.routability === "direct_destination" ? "resolved" as const : "unresolved" as const,
          intent: mention.routability === "anchor_or_poi" ? "landmark" as const : "place" as const,
          country: mention.parentCountries.length === 1 ? mention.parentCountries[0] : undefined,
        })),
      } : undefined,
      routeAssessment: routeIntelligenceForPersistence(routeIntelligence),
      routeIntent: effectiveIntent.route,
      intent: {
        ...effectiveIntent,
        hardConstraints: {
          ...effectiveIntent.hardConstraints,
          fixedCommitments: projectedFixedCommitments,
        },
      },
      structuredBrief: effectiveStructuredBrief,
      scheduleLocks,
      decisionSelections,
    });
    const hydratedCanonical = hydratedCanonicalTripRef.current?.id === built.id ? hydratedCanonicalTripRef.current : null;
    let reconciled = preserveBuilderCanonicalState(hydratedCanonical, { ...built, ownerId: tripOwnerId, legs: builderCanonicalLegs });
    if (!hydratedCanonical && !sourceRouteKey) reconciled = projectBuilderCalendar(reconciled, reconciled).trip;
    return tripOwnerId && tripUpdatedAt ? { ...reconciled, updatedAt: tripUpdatedAt } : reconciled;
  }, [canonicalBuilder, tripId, tripOwnerId, tripStatus, tripUpdatedAt, sourceRouteKey, currentCuratedRoute, origin, originCanonicalPlaceId, originCountry, originProviderId, journeyEnd, stops, startDate, endDate, effectivePicks, tripBrief, budget, budgetPreference, calendarDayAllocations, allocation, manualNightStopIds, nightAllocation, draft, discoveredPlaces, originCoordinates, createdAt, intakeMentions, activePlaceMentions, routeHints, routeIntelligence, effectiveIntent, projectedFixedCommitments, effectiveStructuredBrief, scheduleLocks, decisionSelections, builderCanonicalLegs]);

  const resolveEndpointDraftPlace = async (place: JourneyEndpointPlace, role: "start" | "end") => {
    if (journeyEndpointIdentityIsCoherent(place)) return place;
    const name = place.name.trim();
    if (!name) return null;
    try {
      const response = await fetch(`/api/journey-geocode?place=${encodeURIComponent(name)}&candidates=1`);
      const payload = await response.json() as { candidates?: LocationChoice[] };
      const resolution = resolveTypedJourneyEndpoint(name, payload.candidates ?? []);
      if (resolution.status === "resolved") return resolution.place;
      setDetailsCommitError(resolution.status === "ambiguous"
        ? (language === "es" ? `Elige qué ${role === "start" ? "punto de partida" : "lugar de llegada"} quieres decir.` : `Choose which ${role === "start" ? "starting place" : "ending place"} you mean.`)
        : (language === "es" ? "Elige un lugar de las sugerencias." : "Choose a place from the suggestions."));
      return null;
    } catch {
      setDetailsCommitError(language === "es" ? "No pudimos comprobar ese lugar ahora." : "We couldn't check that place just now.");
      return null;
    }
  };

  const commitTripDetailsDocument = (document: EasyTTrip) => {
    const nextEnd = normalizeJourneyEnd(document.brief.journeyEnd);
    replaceJourneyOrigin({
      name: document.brief.origin,
      canonicalPlaceId: document.brief.originCanonicalPlaceId,
      country: document.brief.originCountry,
      providerId: document.brief.originProviderId,
      coordinates: document.brief.originCoordinates,
    });
    setOriginTouched(true);
    setOriginError("");
    setJourneyEnd(nextEnd);
    setJourneyEndInput(nextEnd.mode === "explicit" ? nextEnd.place.name : "");
    setJourneyEndTouched(true);
    setJourneyEndError("");
    setJourneyEndResolutionAttempted(true);
    setStartDate(document.startDate);
    setEndDate(document.endDate);
    setDatesManuallyEdited(true);
    setBudget(document.brief.budgetBand);
    setBudgetPreference(document.brief.budgetPreference);
    setTravellersManuallyEdited(true);
    setTripIntent((current) => ({
      ...current,
      journeyEnd: nextEnd,
      travellers: document.travellers,
      timing: { ...current.timing, durationDays: Math.max(1, Math.round((+new Date(`${document.endDate}T00:00:00`) - +new Date(`${document.startDate}T00:00:00`)) / 86400000) + 1) },
      preferences: { ...current.preferences, budgetSensitivity: document.brief.budgetBand },
    }));
  };

  const commitTripDetailsDraft = async (detailsDraft: TripBuilderDetailsDraft, sourceFingerprint: string) => {
    const capturedRevision = builderEditSessionRef.current?.getSnapshot().inputRevision;
    setDetailsCommitBusy(true);
    setDetailsCommitError("");
    try {
      const nextOrigin = await resolveEndpointDraftPlace(detailsDraft.journeyOrigin, "start");
      if (!nextOrigin) return false;
      const normalizedDraftEnd = normalizeJourneyEnd(detailsDraft.journeyEnd);
      const nextEnd = normalizedDraftEnd.mode === "explicit"
        ? await resolveEndpointDraftPlace(normalizedDraftEnd.place, "end")
        : null;
      if (normalizedDraftEnd.mode === "explicit" && !nextEnd) return false;
      const resolvedEnd: JourneyEndSelection = normalizedDraftEnd.mode === "explicit"
        ? { mode: "explicit", place: nextEnd! }
        : normalizedDraftEnd;
      if (builderEditSessionRef.current) {
        if (capturedRevision === undefined) return false;
        const current = builderEditSessionRef.current.getSnapshot();
        const commands = builderDetailsCommands(current.trip, { ...detailsDraft, journeyOrigin: nextOrigin, journeyEnd: resolvedEnd }, sourceFingerprint);
        const rawOrigin=current.draft.fields.find(field=>field.binding.kind==="origin" && field.status==="editable");
        if (!commands.ok || !dispatchAcceptedBuilderEdits(commands.edits, { expectedInputRevision: capturedRevision,
          acceptedInputs:rawOrigin && commands.edits.some(edit=>edit.kind==="origin")?[{binding:{kind:"origin"},raw:rawOrigin.raw}]:undefined })) {
          setDetailsCommitError(commands.ok || commands.reason === "stale-source"
            ? "The trip changed while these details were checked. Review the latest trip and try again."
            : "This ending place cannot be added by the new route controls. Your existing trip remains preserved.");
          return false;
        }
        setOriginTouched(true); setOriginError(""); setJourneyEndError("");
        setDatesManuallyEdited(true); setTravellersManuallyEdited(true);
        return true;
      }
      const nextIntent = activeTripDocument.brief.intent
        ? {
          ...activeTripDocument.brief.intent,
          journeyEnd: resolvedEnd,
          travellers: detailsDraft.travellers,
          timing: {
            ...activeTripDocument.brief.intent.timing,
            durationDays: Math.max(1, Math.round((+new Date(`${detailsDraft.endDate}T00:00:00`) - +new Date(`${detailsDraft.startDate}T00:00:00`)) / 86400000) + 1),
          },
          preferences: { ...activeTripDocument.brief.intent.preferences, budgetSensitivity: detailsDraft.budget },
        }
        : undefined;
      const proposedBrief: EasyTTrip["brief"] = {
        ...activeTripDocument.brief,
        endDateIsSuggestion: detailsDraft.startDate === startDate && detailsDraft.endDate === endDate && endDateStillSuggested,
        origin: nextOrigin.name,
        originCoordinates: nextOrigin.coordinates,
        originCanonicalPlaceId: nextOrigin.canonicalPlaceId,
        originCountry: nextOrigin.country,
        originProviderId: nextOrigin.providerId,
        journeyEnd: resolvedEnd,
        budgetBand: detailsDraft.budget,
        budgetPreference: { source: "explicit", value: detailsDraft.budget },
        ...(activeTripDocument.brief.structuredBrief ? {
          structuredBrief: mergeStructuredTripBrief(activeTripDocument.brief.structuredBrief, { budget: detailsDraft.budget }),
        } : {}),
        ...(nextIntent ? { intent: nextIntent } : {}),
      };
      const proposed: EasyTTrip = {
        ...activeTripDocument,
        startDate: detailsDraft.startDate,
        endDate: detailsDraft.endDate,
        travellers: detailsDraft.travellers,
        brief: proposedBrief,
        legs: buildCanonicalTripLegs({
          tripId: activeTripDocument.id,
          origin: {
            name: nextOrigin.name,
            country: nextOrigin.country,
            canonicalPlaceId: nextOrigin.canonicalPlaceId,
            providerId: nextOrigin.providerId,
            coordinates: nextOrigin.coordinates ?? null,
          },
          journeyEnd: resolvedEnd,
          stops: activeTripDocument.stops,
          constraints: structuredRouteConstraints,
          curatedRoute: currentCuratedRoute,
        }),
      };
      const result = prepareBuilderDocumentCommit({
        current: activeTripDocument,
        proposed,
        expectedFingerprint: sourceFingerprint,
        fingerprint: builderDetailsFingerprint,
        validate: (candidate) => isEasyTTrip(candidate)
          && /^\d{4}-\d{2}-\d{2}$/.test(candidate.startDate)
          && /^\d{4}-\d{2}-\d{2}$/.test(candidate.endDate)
          && candidate.startDate <= candidate.endDate
          && Number.isInteger(candidate.travellers)
          && candidate.travellers >= 1
          && candidate.travellers <= 12
          && journeyEndpointIdentityIsCoherent(nextOrigin)
          && (resolvedEnd.mode !== "explicit" || journeyEndpointIdentityIsCoherent(resolvedEnd.place)),
      });
      if (!result.ok) {
        setDetailsCommitError(result.reason === "stale-source"
          ? (language === "es" ? "El viaje cambió mientras editabas. Revisa los datos más recientes e inténtalo de nuevo." : "The trip changed while you were editing. Review the latest details and try again.")
          : (language === "es" ? "Revisa los datos del viaje antes de guardarlos." : "Review the trip details before saving."));
        return false;
      }
      if (detailsDraft.startDate !== startDate || detailsDraft.endDate !== endDate) setEndDateStillSuggested(false);
      commitTripDetailsDocument(result.document);
      return true;
    } finally {
      setDetailsCommitBusy(false);
    }
  };

  const finalPlanValidation = useMemo(() => {
    const documentStops = new Map(activeTripDocument.stops.map((stop) => [stop.id, stop]));
    const allocationInputs = new Map(nightAllocationStops.map((stop) => [stop.id, stop]));
    const requiredStopIds = [...new Set([
      ...(structuredRouteConstraints.requiredStopIds ?? []),
      ...effectiveIntent.hardConstraints.mustSeeStopIds,
    ])];
    return validateFinalPlan({
      plan: {
        version: 1,
        origin: { name: origin, coordinates: originCoordinates },
        stops: stops.map((stop) => {
          const documentStop = documentStops.get(stop.id);
          const allocationInput = allocationInputs.get(stop.id);
          return {
            ...stop,
            nights: Math.max(0, Math.round(allocation[stop.id] ?? 0)),
            arrivalDate: documentStop?.arrivalDate,
            departureDate: documentStop?.departureDate,
            fixedNights: allocationInput?.fixedNights ?? allocationInput?.manualNights,
            required: requiredStopIds.includes(stop.id),
            optional: effectiveIntent.hardConstraints.optionalStopIds.includes(stop.id),
            anchor: allocationInput?.anchor,
            fallbackMinimumNights: allocationInput?.fallbackMinimumNights,
            fallbackIdealNights: allocationInput?.fallbackIdealNights,
            preferenceWeight: allocationInput?.preferenceWeight,
          };
        }),
        totalNights,
        pace: effectiveIntent.preferences.pace,
        startDate,
        endDate,
        constraints: {
          ...structuredRouteConstraints,
          requiredStopIds,
          optionalStopIds: effectiveIntent.hardConstraints.optionalStopIds,
        },
        scheduleLocks,
      },
      structuredBrief: effectiveStructuredBrief,
      nightAllocation,
    });
  }, [activeTripDocument.stops, nightAllocationStops, structuredRouteConstraints, effectiveIntent, origin, originCoordinates, stops, allocation, totalNights, startDate, endDate, scheduleLocks, effectiveStructuredBrief, nightAllocation]);

  const buildPlaceIssues = useMemo(() => {
    const issues = [...placeIssues];
    for (const { mention } of locationChoices) {
      if (issues.some((issue) => issue.mentionId === mention.mentionId && issue.blocksRoute)) continue;
      issues.push({
        code: "ambiguous_place",
        mentionId: mention.mentionId,
        canonicalPlaceId: mention.canonicalPlaceId,
        sourceText: mention.sourceText,
        reason: "Provider results require the traveller to confirm which place they meant.",
        message: `Confirm ${mention.sourceText} before Morrovia adds it to the route.`,
        severity: "error",
        blocksRoute: true,
        options: [],
        provenance: mention.provenance,
        confidence: mention.confidence,
      });
    }
    return issues;
  }, [locationChoices, placeIssues]);
  const buildInvariant = useMemo(() => canBuildTrip({
    origin,
    originCoordinates,
    journeyEnd,
    stops,
    placeReviewPending: resolvingLocations,
    placeIssues: buildPlaceIssues,
    routeConstraintIssues: routeIntelligence.route.constraintIssues,
    requiredStopIds: [...new Set([
      ...(structuredRouteConstraints.requiredStopIds ?? []),
      ...effectiveIntent.hardConstraints.mustSeeStopIds,
    ])],
    maximumStops: structuredRouteConstraints.maximumStops,
    startDate,
    endDate,
    durationDays: totalDays,
    expectedDurationDays: effectiveStructuredBrief.duration?.value
      ? effectiveStructuredBrief.duration.value + (effectiveStructuredBrief.duration.unit === "nights" ? 1 : 0)
      : undefined,
    structuredBriefIssues: effectiveStructuredBrief.issues,
    nightAllocation,
    allocations: allocation,
    planValidation: finalPlanValidation,
    transferImpacts: activeTripDocument.legs.map((leg) => transferImpactFromMetadata(leg.routeMetadata.transferImpact)),
    routeOrderFixed: Boolean(structuredRouteConstraints.fixedCommitments?.length),
    document: activeTripDocument,
  }), [origin, originCoordinates, journeyEnd, stops, resolvingLocations, buildPlaceIssues, routeIntelligence.route.constraintIssues, structuredRouteConstraints.requiredStopIds, structuredRouteConstraints.maximumStops, structuredRouteConstraints.fixedCommitments, effectiveIntent.hardConstraints.mustSeeStopIds, startDate, endDate, totalDays, effectiveStructuredBrief.duration, effectiveStructuredBrief.issues, nightAllocation, allocation, finalPlanValidation, activeTripDocument]);
  useEffect(() => {
    const attemptId = planningAttemptIdRef.current;
    if (!hydrated || !attemptId) return;
    markPlanningMilestone(attemptId, "shell-visible");
    const controlsEnabled = !pendingInterpretation && !deviceRecoveryBlocked && !deviceStorageBlocked && !cloudConflictTrip;
    if (planningContentIsActionable({
      mode: planningModeRef.current,
      editableCanonicalOccurrences: hasRouteSkeleton ? stops.length : 0,
      selectableClarification: clarificationOpen && Boolean(activeClarificationMention),
      controlsEnabled,
    })) markPlanningMilestone(attemptId, "first-actionable");
    const lookupStates = Object.values(handoffResolutionStatuses);
    if (planningRequiredInterpretationIsComplete({
      pendingInterpretation: Boolean(pendingInterpretation),
      pendingLookup: resolvingLocations || lookupStates.includes("pending"),
      failedLookup: lookupStates.includes("failed"),
      routeOccurrences: hasRouteSkeleton ? stops.length : 0,
      selectableDiscovery: clarificationOpen && Boolean(activeClarificationMention),
    })) markPlanningMilestone(attemptId, "required-complete");
    if (!pendingInterpretation && buildInvariant.canBuildTrip) markPlanningMilestone(attemptId, "route-ready");
    // Intent-only capture defers optional suggestions and assessments. Place
    // resolution alone cannot certify that optional enrichment is complete.
  }, [hydrated, pendingInterpretation, hasRouteSkeleton, stops.length, clarificationOpen, activeClarificationMention, deviceRecoveryBlocked, deviceStorageBlocked, cloudConflictTrip, handoffResolutionStatuses, resolvingLocations, buildInvariant.canBuildTrip]);
  const gateConflict = buildInvariant.firstConflict;
  const geographyGateConflict = ['geography-unverified', 'origin-unverified', 'end-unverified'].includes(gateConflict?.code ?? '');
  const gate = gateConflict?.code === "itinerary-stop-uncovered"
    ? (language === "es" ? "No pudimos incluir todas las paradas en el itinerario. Revisa tu ruta e inténtalo de nuevo." : "We couldn't include every stop in the itinerary. Review your route and try again.")
    : gateConflict?.message ?? "";
  const buildAttention = buildInvariant.needsAttention;
  const firstBuildAttention = buildAttention[0];
  const buildAttentionNames = [...new Set(buildAttention.map((item) => item.sourceText))];
  const buildAttentionLabel = buildAttentionNames.length === 1 ? buildAttentionNames[0] : language === "es" ? "estos lugares" : "these places";

  useEffect(() => {
    if (!hasRouteSkeleton || !gateConflict) return;
    setTimingWarningOpen(true);
  }, [gateConflict, hasRouteSkeleton]);

  const routeRecommendationReason = currentAvoidableCountryReentryCount !== null
    && recommendedAvoidableCountryReentryCount !== null
    && recommendedAvoidableCountryReentryCount < currentAvoidableCountryReentryCount
    ? (language === "es" ? "Mantiene juntas las paradas del mismo país y reduce reentradas evitables." : "It keeps stops in the same country together, reducing avoidable re-entry.")
    : backtrackingPenaltyCount !== null
      && recommendedBacktrackingPenaltyCount !== null
      && recommendedBacktrackingPenaltyCount < backtrackingPenaltyCount
      ? (language === "es" ? "Reduce los retrocesos innecesarios entre tus paradas." : "It reduces unnecessary backtracking between your stops.")
      : canonicalTimingComplete && (routeIntelligence.route.improvementMinutes ?? 0) >= 90
        ? (language === "es" ? "Reduce el tiempo estimado de traslado y deja más tiempo en los destinos." : "It reduces estimated transfer time, leaving more of the trip for your destinations.")
        : (language === "es" ? "Mantiene el viaje avanzando en una dirección geográfica más clara." : "It keeps the trip moving in a clearer geographic direction.");
  const routeCoverageNotice = currentCuratedRoute && currentCuratedRoute.coverage.state !== "fully-supported"
    ? `ROUTE COVERAGE CHANGED · ${currentCuratedRoute.coverage.reason}`
    : null;
  const transportReviewNotice = routeIntelligence.route.tradeoffs[0] && effectiveIntent.hardConstraints.avoidDriving
    ? (language === "es" ? "Evitar coche está activo: compara tren o vuelo para los traslados locales antes de reservar." : "Avoid driving is active: compare rail or flight for local transfers before booking.")
    : null;
  const showTimingWarning = Boolean(gateConflict || highlyCompressedTrip || longJourneyIssue || tripTimingNotice);
  const showRouteStatus = Boolean(showTimingWarning || routeRecommendationVisible || routeCoverageNotice || transportReviewNotice);
  const timingWarningTitle = gateConflict
    ? (language === "es" ? "Revisa esto antes de crear el viaje" : "Review this before building")
    : highlyCompressedTrip
      ? (language === "es" ? "Ritmo muy intenso" : "Very fast pace")
      : longJourneyIssue
      ? longJourneyIssue.consequence.reason === "less-than-day"
        ? (language === "es" ? `El viaje deja menos de un día en ${longJourneyIssue.stop.name}` : `Travel leaves less than a day in ${longJourneyIssue.stop.name}`)
        : longJourneyIssue.consequence.reason === "most-stop-travel"
          ? (language === "es" ? `La mayor parte de esta parada sería viaje` : `Most of this stop would be spent travelling`)
          : (language === "es" ? `El viaje reduce el tiempo en ${longJourneyIssue.stop.name}` : `Travel reduces time in ${longJourneyIssue.stop.name}`)
      : tripTimingNotice
        ? (language === "es" ? "Este viaje necesita un ritmo más ajustado" : "This trip needs a tighter pace")
      : routeRecommendationVisible
        ? (language === "es" ? "Hay un orden de ruta mejor" : "A better route order is available")
        : routeCoverageNotice
          ? (language === "es" ? "Cambió la cobertura de la ruta" : "Route coverage changed")
          : transportReviewNotice
            ? (language === "es" ? "Revisa el transporte" : "Review transport")
            : (language === "es" ? "Estado de la ruta" : "Route status");

  const surfaceBuildConflict = () => {
    const conflict = buildInvariant.firstConflict;
    if (!conflict) return;
    setOpeningTrip(false);
    setTimingWarningOpen(true);
    // Passive validation must not interrupt editing; explicit build attempts
    // retain the focused conflict announcement.
    window.requestAnimationFrame(() => timingWarningRef.current?.focus());
    openSummaryEditor(conflict.code.startsWith("origin") ? "origin" : conflict.stage === "places" ? "stops" : "dates");
    if (conflict.stage === "places") setHasPromptContext(true);
  };

  const persistDeviceRecovery = useCallback((trip: EasyTTrip) => {
    const editor = builderEditSessionRef.current;
    if (editor) {
      const snapshot=editor.getSnapshot();
      return {stored:!["storage","protected"].includes(snapshot.error?.category??""),
        handle:snapshot.recovery??{ownerId:snapshot.browserOwnerId,tripId:snapshot.trip.id,writeId:"acknowledged-canonical"},blockedByExistingRecovery:snapshot.error?.category==="protected"};
    }
    const ownerId = activeBrowserOwnerId;
    if (!canUseHydratedTripScope(hydratedOwnerScopeRef.current, ownerId)
      || (trip.ownerId && trip.ownerId !== ownerId)) {
      return {
        stored: false,
        handle: { ownerId, tripId: trip.id, writeId: `scope-mismatch-${Date.now()}` },
        blockedByExistingRecovery: true,
      };
    }
    const currentHandle = recoveryHandleRef.current;
    const replacement = currentHandle?.tripId === trip.id && currentHandle.ownerId === ownerId
      ? currentHandle
      : null;
    const recovery = saveTripRecovery(trip, {
      ownerId,
      replace: replacement ?? undefined,
    });
    if (recovery.stored) {
      recoveryHandleRef.current = recovery.handle;
      const pendingReceipt = pendingNewTripReceiptRef.current;
      if (pendingReceipt && pendingReceipt.receipt.tripId === trip.id
        && pendingReceipt.snapshot.ownerId === ownerId) {
        if (!homepageHandoffMatchesTrip(pendingReceipt.draft, trip)) return { ...recovery, stored: false };
        if (!receiptAcknowledgementRef.current) {
          let acknowledgement: Promise<boolean>;
          acknowledgement = acknowledgePendingIntakeReceipt({
            storage: window.localStorage, pending: pendingReceipt.pending,
            completed: pendingReceipt.receipt, draft: pendingReceipt.draft,
            fromHomepage: Boolean(pendingReceipt.fromHomepage),
            isCurrent: () => pendingNewTripReceiptRef.current === pendingReceipt
              && canUseHydratedTripScope(hydratedOwnerScopeRef.current, ownerId)
              && activeBrowserOwnerIdRef.current === ownerId,
          }).then((result) => {
            if (pendingNewTripReceiptRef.current !== pendingReceipt
              || !canUseHydratedTripScope(hydratedOwnerScopeRef.current, ownerId)) return false;
            if (!result.ok) {
              setDeviceStorageBlocked(true);
              setSaveState("error");
              return false;
            }
            pendingNewTripReceiptRef.current = null;
            const durableUrl = durableBuilderRecoveryUrl(window.location.href, trip.id);
            if (durableUrl) window.history.replaceState(window.history.state, "", durableUrl);
            setDeviceStorageBlocked(false);
            setCloudSaveError("");
            setSaveState("local");
            return true;
          }).finally(() => {
            if (receiptAcknowledgementRef.current === acknowledgement) receiptAcknowledgementRef.current = null;
          });
          receiptAcknowledgementRef.current = acknowledgement;
        }
        // The canonical recovery is synchronous, but its receipt/envelope
        // transition is serialized. Do not claim handoff completion until it
        // has acknowledged this exact still-current token.
        return { ...recovery, stored: false };
      }
      const durableUrl = durableBuilderRecoveryUrl(window.location.href, trip.id);
      if (durableUrl) window.history.replaceState(window.history.state, "", durableUrl);
      const canonicalTrip = hydratedCanonicalTripRef.current;
      const currentUrl = new URL(window.location.href);
      if (trip.ownerId
        && canonicalTrip
        && currentUrl.searchParams.get("trip") === trip.id
        && !tripDocumentsCanonicalEquivalent(trip, canonicalTrip)) {
        currentUrl.searchParams.set("recover", "1");
        window.history.replaceState(window.history.state, "", currentUrl);
      }
    }
    const currentUrl = new URL(window.location.href);
    if (recovery.stored && trip.status === "draft" && !currentUrl.searchParams.has("trip")) {
      const currentDraft = loadCurrentDraftRecovery(ownerId);
      return { ...recovery, stored: currentDraft?.tripId === trip.id && currentDraft.writeId === recovery.handle.writeId };
    }
    return recovery;
  }, [activeBrowserOwnerId]);

  useEffect(() => {
    if (builderSeed || !hydrated || pendingInterpretation || resolvingLocations || tripUnavailable
      || !canUseHydratedTripScope(hydratedOwnerScopeRef.current, activeBrowserOwnerId)
      || (!origin.trim() && !tripBrief.trim() && !activePlaceMentions.length && !stops.length)) return;
    let active=true;
    const start=async()=>{
      try {
        const source=hydratedCanonicalTripRef.current?.id===activeTripDocument.id ? hydratedCanonicalTripRef.current : null;
        const candidate=requireReadableTripDocument(source??activeTripDocument);
        const openedRecovery=source ? recoveryHandleRef.current : null;
        let persistedRecovery: ReturnType<typeof persistDeviceRecovery> | null = null;
        if (!source) {
          persistedRecovery=persistDeviceRecovery(candidate);
          if(receiptAcknowledgementRef.current) { await receiptAcknowledgementRef.current; if(!active)return; persistedRecovery=persistDeviceRecovery(candidate); }
          if(!persistedRecovery.stored) return;
        }
        // A guest reconstruction can reuse a durable write with an older timestamp.
        // Seed that exact document and reject a later or foreign recovery.
        const recovery=loadTripRecovery(candidate.id,activeBrowserOwnerId);
        const expectedRecovery=persistedRecovery?.handle ?? openedRecovery;
        if (expectedRecovery && !recovery || recovery && (recovery.ownerId !== activeBrowserOwnerId
          || recovery.tripId !== candidate.id || !recovery.writeId || !sameRecoveryDocument(recovery.trip,candidate)
          || expectedRecovery && (recovery.ownerId !== expectedRecovery.ownerId
            || recovery.tripId !== expectedRecovery.tripId || recovery.writeId !== expectedRecovery.writeId))) {
          setDeviceRecoveryBlocked(true);setCloudSaveError("Open this device's separate recovery before editing the account trip.");return;
        }
        if(active) {
          builderSeedPendingRef.current = true;
          setBuilderSeed({initialTrip:recovery?.trip ?? candidate,initialRecovery:recovery,
            initialCanonicalTrip:recovery?null:candidate,allowRecoverySync:!source || builderSearchParams.get("recover")==="1"});
        }
      }catch { if(active) {setDeviceStorageBlocked(true);setSaveState("error");setCloudSaveError("This trip could not be opened safely. Its recovery is preserved.");} }
    };
    void start();return()=>{active=false};
  },[builderSeed,hydrated,pendingInterpretation,resolvingLocations,tripUnavailable,activeBrowserOwnerId,activeTripDocument,persistDeviceRecovery]);

  useEffect(() => {
    const preserveBeforeNewTrip = (event: Event) => {
      if (!hydrated || (!origin.trim() && !tripBrief.trim() && !stops.length)) return;
      const recovery = persistDeviceRecovery(activeTripDocument);
      if (builderEditSessionRef.current) void builderEditSessionRef.current.flush();
      if (receiptAcknowledgementRef.current) {
        event.preventDefault();
        setSaveState("device-saving");
        return;
      }
      setDeviceRecoveryBlocked(recovery.blockedByExistingRecovery);
      setDeviceStorageBlocked(!recovery.stored && !recovery.blockedByExistingRecovery);
      if (shouldAllowNewTripNavigation(recovery)) {
        setSaveState("local");
        return;
      }
      event.preventDefault();
      setSaveState("error");
      setCloudSaveError(recovery.blockedByExistingRecovery
        ? (language === "es"
          ? "Resuelve primero la copia de recuperación de este dispositivo antes de empezar otro viaje."
          : "Open or resolve this device's recovery copy before starting another trip.")
        : (language === "es"
          ? "No pudimos guardar los cambios más recientes, así que no iniciamos otro viaje."
          : "The latest changes could not be saved, so Morrovia did not start another trip."));
    };
    window.addEventListener(EASYT_BEFORE_NEW_TRIP_EVENT, preserveBeforeNewTrip);
    return () => window.removeEventListener(EASYT_BEFORE_NEW_TRIP_EVENT, preserveBeforeNewTrip);
  }, [activeTripDocument, hydrated, language, origin, persistDeviceRecovery, stops.length, tripBrief]);

  useEffect(() => {
    // A broad-place draft can have no route stops yet. Its explicit discovery
    // choices still need the same device recovery as a shaped route.
    if (builderSeed || builderEditSessionRef.current || !hydrated || pendingInterpretation || (!origin.trim() && !tripBrief.trim() && !activePlaceMentions.length && !stops.length)) return;
    setSaveState("device-saving");
    const timer = window.setTimeout(() => {
      const acknowledged = lastAcknowledgedCanonicalRef.current;
      if (acknowledged && tripDocumentsCanonicalEquivalent(activeTripDocument, acknowledged)) {
        if (planningAttemptIdRef.current) markPlanningMilestone(planningAttemptIdRef.current, "durable-intake");
        setSaveState("cloud");
        return;
      }
      lastAcknowledgedCanonicalRef.current = null;
      const recovery = persistDeviceRecovery(activeTripDocument);
      if (recovery.stored && planningAttemptIdRef.current) markPlanningMilestone(planningAttemptIdRef.current, "durable-intake");
      if (receiptAcknowledgementRef.current) {
        setSaveState("device-saving");
        return;
      }
      if (arrivedFromHomepage) void removeHomeTripDraftIfDurable(window.localStorage, homeDraftRef.current, activeTripDocument, recovery.stored, resolvingLocations);
      setDeviceRecoveryBlocked(recovery.blockedByExistingRecovery);
      setDeviceStorageBlocked(!recovery.stored && !recovery.blockedByExistingRecovery);
      setSaveState(recovery.stored ? "local" : "error");
      if (!recovery.stored && !cloudConflictTrip) {
        setCloudSaveError(recovery.blockedByExistingRecovery
          ? (language === "es"
            ? "Ya hay cambios de este dispositivo que deben resolverse antes de editar la copia en la nube."
            : "This device already has separate edits. Open that device copy to continue or resolve it explicitly.")
          : (language === "es"
            ? "El navegador bloqueó el almacenamiento. Mantén esta pestaña abierta antes de salir."
            : "Browser storage is blocked. Keep this tab open before leaving."));
      } else if (!cloudConflictTrip && (deviceStorageBlocked || deviceRecoveryBlocked)) {
        setCloudSaveError("");
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [builderSeed, hydrated, pendingInterpretation, activeTripDocument, arrivedFromHomepage, cloudConflictTrip, deviceRecoveryBlocked, deviceStorageBlocked, language, persistDeviceRecovery, resolvingLocations]);

  const recordGeneratedTrip = () => {
    if (generationCompletedRef.current) return buildInvariant.canBuildTrip;
    if (!buildInvariant.canBuildTrip) {
      trackEvent("trip_generation_failed", {
        trip_source: analyticsTripSource,
        error_type: "invalid_result",
        is_authenticated: Boolean(session?.user),
      });
      return false;
    }
    generationCompletedRef.current = true;
    trackEvent("trip_generated", {
      trip_source: analyticsTripSource,
      trip_id: activeTripDocument.id,
      stop_count: activeTripDocument.stops.length,
      duration_days: totalDays,
      traveller_count: effectiveIntent.travellers,
      has_dates: Boolean(startDate && endDate),
      save_state: "local",
      result: "usable",
    });
    return true;
  };

  const persistGeneratedTrip = async () => {
    const editor=builderEditSessionRef.current;
    if(editor) {
      const reportSaveFailure = () => {
        const snapshot = editor.getSnapshot();
        if (!snapshot.error || snapshot.browserOwnerId !== activeBrowserOwnerIdRef.current) return;
        const category = snapshot.error.category;
        trackEvent("trip_save_failed", {
          trip_source: analyticsTripSource, trip_id: snapshot.trip.id,
          save_state: category === "storage" || category === "protected" ? "local" : "cloud",
          error_type: category === "auth" || category === "network" || category === "conflict" || category === "repository"
            ? category : category === "protected" ? "conflict" : "unknown",
          is_authenticated: snapshot.browserOwnerId !== null,
        });
      };
      if(!buildInvariant.canBuildTrip) {surfaceBuildConflict();recordGeneratedTrip();return null;}
      recordGeneratedTrip();
      if(editor.getSnapshot().trip.status!=="planned" && !dispatchAcceptedBuilderEdit({kind:"build-status"})) {reportSaveFailure();return null;}
      if(!await editor.flush({promoteOwnerless:true})) {reportSaveFailure();return null;}
      return editor.getSnapshot().trip;
    }
    setCloudSaveError("Wait for this trip to finish opening before building. Its input remains preserved.");
    return null;
  };

  const settleUnacknowledgedBuild = () => {
    // A stale response, interrupted account scope, or failed save must never
    // leave the primary action looking active after it has stopped. The local
    // recovery document has already been written before cloud persistence.
    setOpeningTrip(false);
    setSaveState("error");
    setCloudSaveError((current) => current || "Morrovia could not confirm this account save. The exact trip remains saved on this device; try again before building.");
  };

  const openBuiltTrip = () => {
    if (!buildInvariant.canBuildTrip) {
      surfaceBuildConflict();
      return;
    }
    setOpeningTrip(true);
    acceptCurrentRoute("continue");
    // Route acceptance and the draft -> planned transition are durable edits.
    // Persist from the resulting render so Build recovery, delayed autosave
    // and the cloud request all refer to one document and one write ID.
    setTripStatus("planned");
    setBuildRequested(true);
  };

  const continueBuildTrip = () => {
    if (endDateStillSuggested) return;
    if (!buildInvariant.canBuildTrip) {
      surfaceBuildConflict();
      return;
    }
    setOpeningTrip(true);
    if ((!arrivedFromHomepage || sourceRouteKey) && !generationStartedRef.current) {
      generationStartedRef.current = true;
      trackEvent("trip_generation_started", {
        trip_source: analyticsTripSource,
        has_dates: Boolean(startDate && endDate),
        traveller_count: effectiveIntent.travellers,
        is_authenticated: Boolean(session?.user),
      });
    }
    openBuiltTrip();
  };

  const buildTrip = () => {
    if (endDateStillSuggested) return;
    if (!buildInvariant.canBuildTrip) {
      surfaceBuildConflict();
      return;
    }
    if (buildAttention.length) {
      setBuildAttentionReviewOpen(true);
      return;
    }
    continueBuildTrip();
  };

  useEffect(() => {
    if (!buildRequested) return;
    setBuildRequested(false);
    if (endDateStillSuggested) return;
    if (!buildInvariant.canBuildTrip) {
      surfaceBuildConflict();
      return;
    }
    void (async () => {
      const saved = await persistGeneratedTrip();
      const resultOwnerId = saved?.ownerId ?? hydratedOwnerScopeRef.current ?? null;
      if (saved
        && canUseHydratedTripScope(hydratedOwnerScopeRef.current, activeBrowserOwnerIdRef.current)
        && resultOwnerId === activeBrowserOwnerIdRef.current) {
        window.location.assign(!saved.ownerId ? firstTripWorkspaceHref(saved.id) : !session?.user ? tripSyncSignInPath(saved.id) : firstTripWorkspaceHref(saved.id));
      } else settleUnacknowledgedBuild();
    })();
  }, [buildRequested, activeTripDocument, buildInvariant.canBuildTrip, endDateStillSuggested]);

  useEffect(() => {
    if (!hydrated || legacyFocusScheduledRef.current) return;
    legacyFocusScheduledRef.current = true;
    const target = legacyFocusRef.current === "timing" && hasRouteSkeleton ? "builder-timing" : "builder-summary";
    if (legacyFocusRef.current) window.requestAnimationFrame(() => {
      const section = document.getElementById(target);
      section?.scrollIntoView({ block: "start" });
      section?.focus({ preventScroll: true });
    });
    const url = new URL(window.location.href);
    if (url.searchParams.has("step")) {
      url.searchParams.delete("step");
      window.history.replaceState(window.history.state, "", url);
    }
  }, [hydrated, hasRouteSkeleton]);

  /* ------------------------------------------------------------ draft view */

  const ownerScopeMismatch = hydrated && (
    !canUseHydratedTripScope(hydratedOwnerScopeRef.current, activeBrowserOwnerId)
    || Boolean(tripOwnerId && tripOwnerId !== activeBrowserOwnerId)
  );
  const clarificationIssue = activeClarificationMention
    ? placeIssues.find((issue) => issue.mentionId === activeClarificationMention.mentionId && issue.code !== "missing_routable_destination" && issue.code !== "duplicate_alias")
    : undefined;
  const clarificationAttractionProposal = activeClarificationMention
    ? attractionVisitProposals.get(activeClarificationMention.mentionId)
    : undefined;
  const clarificationParentName = activeClarificationMention ? placeDisplayName(activeClarificationMention) : activeProviderClarification?.mention.sourceText ?? "this place";
  const clarificationSupportsMultiple = Boolean(activeClarificationMention && placeMentionSupportsMultipleSelections(activeClarificationMention));
  const clarificationSelected = activeClarificationMention
    ? effectiveStructuredBrief.placeSelections?.filter((selection) => selection.mentionId === activeClarificationMention.mentionId) ?? []
    : [];
  const clarificationSelectedPlaces: BuilderClarificationSelectedPlace[] = clarificationSelected.map((selection) => ({
    id: selection.selectedCanonicalPlaceId,
    name: selection.selectedName,
    detail: selection.routeStopId ? stops.find((stop) => stop.id === selection.routeStopId)?.country : undefined,
  }));
  const clarificationIndependentStopIds = activeClarificationMention ? stops.filter((stop) => (
    stopMatchesPlace(stop, journeyStartPlace)
    || stopMatchesPlace(stop, routeJourneyEnd)
    || capturedStructuredBrief.destinations.some((destination) => destination.placeMentionId !== activeClarificationMention.mentionId
      && stopMatchesPlace(stop, destination))
  )).map((stop) => stop.id) : [];
  const clarificationProtectedStopIds = activeClarificationMention ? stops.filter((stop) => {
    const normalizedName = stop.name.toLocaleLowerCase();
    const hasBooking = activeTripDocument.brief.bookings?.some((booking) => [
      booking.location,
      booking.title,
      booking.transportDetails?.from,
      booking.transportDetails?.to,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedName))) ?? false;
    const hasFixedCommitment = effectiveIntent.hardConstraints.fixedCommitments
      .some((commitment) => commitment.label.toLocaleLowerCase().includes(normalizedName));
    return scheduleLocks.stopIds.includes(stop.id)
      || Boolean(scheduleLocks.arrivalDates[stop.id])
      || manualNightStopIds.includes(stop.id)
      || activeTripDocument.planItems.some((item) => item.stopId === stop.id)
      || hasBooking
      || hasFixedCommitment;
  }).map((stop) => stop.id) : [];
  const activeClarificationRemovalPlan = activeClarificationMention ? builderClarificationRemovalPlan({
    mentionId: activeClarificationMention.mentionId,
    selections: effectivePlaceSelections,
    existingStopIds: stops.map((stop) => stop.id),
    protectedStopIds: clarificationProtectedStopIds,
    independentStopIds: clarificationIndependentStopIds,
  }) : null;
  const clarificationUsesNearbyBases = Boolean(activeClarificationMention
    && !requiresPhysicalIslandVerification(activeClarificationMention)
    && activeClarificationMention.routability !== "direct_destination"
    && ["landmark", "natural_area", "island", "archipelago", "coast", "mountain_range", "valley", "travel_corridor"].includes(activeClarificationMention.placeType));
  const clarificationDiscovery = activeClarificationMention && clarificationSupportsMultiple
    && !clarificationUsesNearbyBases && activeClarificationMention.status === "resolved"
    ? buildCountryDiscovery(activeClarificationMention, {
      mentions: activePlaceMentions,
      interests: effectiveIntent.preferences.interests,
      totalNights: datesManuallyEdited || effectiveStructuredBrief.duration ? Math.max(1, totalDays - 1) : undefined,
      existingPlaceIds: stops.flatMap((stop) => stop.canonicalPlaceId ? [stop.canonicalPlaceId] : []),
      explicitChoiceIds: capturedStructuredBrief.countryDiscoveryChoices?.[activeClarificationMention.mentionId],
    }) : null;
  const countryEnrichmentKey = activeClarificationMention && clarificationDiscovery && clarificationDiscovery.candidates.length < 6
    ? JSON.stringify({ owner: activeBrowserOwnerId, trip: activeTripDocument?.id, mention: activeClarificationMention.mentionId,
      country: activeClarificationMention.canonicalName, interests: effectiveIntent.preferences.interests,
      pace: effectiveStructuredBrief.pace?.value ?? effectiveIntent.preferences.pace,
      nights: effectiveStructuredBrief.duration?.value ?? totalDays - 1,
      existing: stops.flatMap((stop) => stop.canonicalPlaceId ? [stop.canonicalPlaceId] : []).sort() }) : "";
  useEffect(() => {
    if (!clarificationOpen || !countryEnrichmentKey || !activeClarificationMention || !clarificationDiscovery
      || clarificationUsesNearbyBases) return;
    const existingRequest = countryEnrichmentRequestsRef.current.get(countryEnrichmentKey);
    if (existingRequest) {
      setCountryEnrichment({ key: countryEnrichmentKey, status: "loading", suggestions: [] });
      void existingRequest.then((suggestions) => setCountryEnrichment({ key: countryEnrichmentKey,
        status: suggestions.length ? "ready" : "unavailable", suggestions }));
      return;
    }
    const countryName = activeClarificationMention.canonicalName;
    const interests = effectiveIntent.preferences.interests.slice(0, 8).join(", ");
    const nights = effectiveStructuredBrief.duration?.value ?? Math.max(1, totalDays - 1);
    const existingNames = stops.filter((stop) => stop.canonicalPlaceId).map((stop) => stop.name).slice(0, 8).join(", ");
    const prompt = `I am planning a trip in ${countryName}. Suggest up to six additional city or town overnight-base candidates located in ${countryName}. Interests: ${interests || "varied"}. Pace: ${effectiveStructuredBrief.pace?.value ?? effectiveIntent.preferences.pace}. Trip length: about ${nights} nights. Existing stops to avoid duplicating: ${existingNames || "none"}. Return place names only; do not claim connections, schedules, lodging availability, visa rules, opening hours, or trip suitability.`;
    setCountryEnrichment({ key: countryEnrichmentKey, status: "loading", suggestions: [] });
    const request = (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 18_000);
      try {
        const response = await fetch("/api/journey-capture", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ brief: prompt }), signal: controller.signal });
        if (!response.ok) return [] as GuidedPlanningAreaSuggestion[];
        const body = await response.json() as { planningSuggestions?: GuidedPlanningAreaSuggestion[] };
        const rows = Array.isArray(body.planningSuggestions) ? body.planningSuggestions : [];
        const seen = new Set<string>();
        return rows.filter((row) => {
          const id = row?.canonicalPlaceId;
          const valid = typeof id === "string" && row.country?.toLocaleLowerCase() === countryName.toLocaleLowerCase()
            && ["city", "town", "transport_gateway"].includes(row.placeType) && Boolean(row.coordinates?.length === 2)
            && Boolean(row.provenance?.length) && !clarificationDiscovery.candidates.some((candidate) => candidate.placeId === id)
            && placeCandidateWithinPlanningParent({ canonicalName: row.name, placeType: row.placeType, parentCountries: [row.country],
              coordinates: row.coordinates, routability: "direct_destination" }, activeClarificationMention);
          if (!valid || seen.has(id)) return false;
          seen.add(id);
          return true;
        }).slice(0, 6).map((row) => ({ ...row, mentionId: activeClarificationMention.mentionId, anchorMatched: false,
          reason: `An additional place resolved within ${countryName}; check how it fits your route.` }));
      } catch { return [] as GuidedPlanningAreaSuggestion[]; }
      finally { window.clearTimeout(timeout); }
    })();
    countryEnrichmentRequestsRef.current.set(countryEnrichmentKey, request);
    void request.then((suggestions) => setCountryEnrichment({ key: countryEnrichmentKey,
      status: suggestions.length ? "ready" : "unavailable", suggestions }));
  }, [clarificationOpen, countryEnrichmentKey]);
  const activeCountryEnrichment = countryEnrichment.key === countryEnrichmentKey ? countryEnrichment : null;
  const discoveryEntry: DiscoveryEntry = activeClarificationMention
    ? discoveryEntryForBrief({ ...effectiveStructuredBrief, placeMentions: activePlaceMentions },
      stops.flatMap((stop) => stop.canonicalPlaceId && geographicallyReady(stop) ? [stop.canonicalPlaceId] : []), activeClarificationMention.mentionId,
      canonicalBuilder?.brief.intent.route.destinations.filter(intent=>intent.resolution==='resolved' && intent.stopIds.length>0
        && (intent.kind==='overnight_place'||selectedMentionIds.has(intent.id))
        && intent.stopIds.every(id=>{const stop=canonicalBuilder.stops.find(stop=>stop.id===id);return stop&&geographicallyReady(stopGeographicPlace(stop));})).map(intent=>intent.id))
    : { kind: "legacy-recovery", step: "places", reason: "technical-failure" };
  const discoveryRead = activeClarificationMention
    ? readDiscoveryDraft(capturedStructuredBrief, activeClarificationMention.mentionId) : null;
  const discoveryDraft = discoveryRead && discoveryEntry.kind !== "legacy-recovery"
    ? { ...discoveryRead.draft, step: discoveryRead.status === "current" ? discoveryRead.draft.step : discoveryEntry.step }
    : null;
  const discoveryExistingPlaceIds = stops.flatMap((stop) => stop.canonicalPlaceId ? [stop.canonicalPlaceId] : []);
  const discoveryProjectionIdentity = activeClarificationMention && discoveryDraft && discoveryEntry.kind !== "skip"
    ? discoveryProjectionKey({ mention: activeClarificationMention, draft: discoveryDraft,
      durationDays: effectiveStructuredBrief.duration?.value, interests: effectiveIntent.preferences.interests,
      existingPlaceIds: discoveryExistingPlaceIds }) : null;
  const discoveryProjection = useMemo(() => activeClarificationMention && discoveryDraft && discoveryEntry.kind !== "skip"
    ? (() => { try { return projectDiscovery({ mention: activeClarificationMention, draft: discoveryDraft,
      context: { durationDays: effectiveStructuredBrief.duration?.value, interests: effectiveIntent.preferences.interests,
        existingPlaceIds: discoveryExistingPlaceIds } }); }
    catch { return null; } })() : null, [discoveryProjectionIdentity]);
  const discoveryEventKind = discoveryEntry.kind === "skip" || discoveryEntry.kind === "legacy-recovery"
    ? "clarification" : discoveryEntry.kind;
  const canonicalDiscoveryReview = useMemo(() => !discoveryCommitting && activeClarificationMention && discoveryDraft && discoveryProjection
    ? buildDiscoveryReview({ mention: activeClarificationMention, draft: discoveryDraft, projection: discoveryProjection,
      trip: activeTripDocument, currentValidation: finalPlanValidation,
      constraints: { ...structuredRouteConstraints, fixedCommitments: projectedFixedCommitments } }) : undefined,
    [discoveryCommitting, activeClarificationMention, JSON.stringify(discoveryDraft), discoveryProjection, activeTripDocument, finalPlanValidation, structuredRouteConstraints, projectedFixedCommitments]);
  const addDiscoverySearchSelection = (suggestion: CanonicalPlaceSuggestion, outsideAccepted: boolean) => {
    if (!activeClarificationMention || !discoveryDraft || !discoverySearchStopSuggestion(suggestion)) return;
    const mentionId = activeClarificationMention.mentionId;
    const action = { type: "add-search-shortlist" as const, suggestion, outsideAccepted };
    updateDiscoveryPlanningState(current => {
      const read = readDiscoveryDraft(current, mentionId);
      if (read.status === "unsupported-version") return current;
      return { ...current, discoveryDraftByMentionId: { ...current.discoveryDraftByMentionId,
        [mentionId]: reduceDiscoveryDraft(read.draft, action) } };
    });
    setBaseSearchInputs(current => ({ ...current, [mentionId]: "" }));
    setBaseSearchErrors(current => ({ ...current, [mentionId]: "" }));
    setOutsideDiscoveryChoice(null);
    setPendingDiscoveryBase(null);
  };
  // flushSync checkpoints must read the document and handlers from the committed render,
  // never the closure that started a multi-choice confirmation.
  const applyDiscoveryRouteOrder = (orderedStopIds: readonly string[]) => {
    const currentIds = discoveryOwnersRef.current.trip.stops.map(stop => stop.id);
    if (orderedStopIds.length === currentIds.length && orderedStopIds.every((id, index) => id === currentIds[index])) return true;
    // Discovery ordering is a recommendation, so honor the same constraints
    // that gate Route Check. A fixed schedule keeps its existing chronology;
    // it must not block committing the selected places.
    if (scheduleLocks.stopIds.length || Object.keys(scheduleLocks.arrivalDates).length || structuredRouteConstraints.fixedCommitments?.length) return true;
    const applied = commitStopOrder(orderedStopIds, "route-check");
    if (applied && !builderEditSessionRef.current) setDecisionSelections(current => ({ ...current, routeOrder: "recommended" }));
    return applied;
  };
  const discoveryOwnersRef = useRef({ trip: activeTripDocument, addGuidedPlanningPlace, confirmAttractionVisit, persistDeviceRecovery, applyRouteOrder: applyDiscoveryRouteOrder });
  useLayoutEffect(() => {
    discoveryOwnersRef.current = { trip: activeTripDocument, addGuidedPlanningPlace, confirmAttractionVisit, persistDeviceRecovery, applyRouteOrder: applyDiscoveryRouteOrder };
  });
  // Keep transient feedback and scrollable content above the actual action
  // height, including wrapping/error copy and text zoom. Never dismiss save errors.
  useLayoutEffect(() => {
    const action = builderActionRef.current;
    const root = action?.closest<HTMLElement>('[data-builder-root]');
    if (!action || !root) return;
    const measure = () => {
      if (window.matchMedia('(max-width: 520px)').matches) root.style.setProperty('--morrovia-builder-action-height', `${Math.ceil(action.getBoundingClientRect().height)}px`);
      else root.style.removeProperty('--morrovia-builder-action-height');
    };
    const observer = new ResizeObserver(measure);
    observer.observe(action);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); root.style.removeProperty('--morrovia-builder-action-height'); };
  }, [hasRouteSkeleton, hydrated, mountedBuilder?.session]);
  // Existing source-owned identity choices must remain reachable even when
  // editorial Discovery has no suggestions for the requested place.
  const renderedDiscoveryEntry: DiscoveryEntry = activeProviderClarification
    ? { kind: "legacy-recovery", step: "places", mentionId: activeProviderClarification.mention.mentionId, reason: "unresolved-identity" }
    : !discoveryProjection && discoveryEntry.kind !== "skip" && discoveryEntry.kind !== "legacy-recovery"
    ? { kind: "legacy-recovery", step: "places", mentionId: activeClarificationMention?.mentionId, reason: "technical-failure" }
    : discoveryEntry;
  useEffect(() => {
    if (clarificationOpen && renderedDiscoveryEntry.kind === "skip") advanceClarificationSession();
  }, [activeClarificationId, clarificationOpen, renderedDiscoveryEntry.kind]);
  const clarificationGuidedSuggestions = activeClarificationMention && clarificationSupportsMultiple
    && !clarificationUsesNearbyBases
    ? guidedPlanningAreaSuggestions(activeClarificationMention, {
      mentions: activePlaceMentions,
      interests: effectiveIntent.preferences.interests,
    }).filter((suggestion) => !stops.some((stop) => stop.canonicalPlaceId === suggestion.canonicalPlaceId))
    : [];
  const clarificationModelSuggestions = activeClarificationMention
    ? (clarificationUsesNearbyBases
      ? [...planningSuggestions, ...regionalBaseSuggestions(activeClarificationMention).map((suggestion) => ({ ...suggestion, anchorMatched: false }))]
      : planningAreaSuggestionsWithinParent([...planningSuggestions, ...(activeCountryEnrichment?.suggestions ?? [])], planningParentForMention(activeClarificationMention)))
      .filter((suggestion) => suggestion.mentionId === activeClarificationMention.mentionId
        && (!clarificationUsesNearbyBases || Boolean(activeNearbyBaseAnchor && canonicalPlaceSuggestionSuitableAsNearbyBase(activeNearbyBaseAnchor, {
          canonicalPlaceId: suggestion.canonicalPlaceId,
          name: suggestion.name,
          label: `${suggestion.name}, ${suggestion.country}`,
          country: suggestion.country,
          region: suggestion.region,
          placeType: suggestion.placeType,
          coordinates: suggestion.coordinates,
          routability: "direct_destination",
          provenance: suggestion.provenance,
        })))
        // A nearby base already on the route can resolve this separate park
        // intent through Add stop's canonical existing-base reuse path.
        && (clarificationUsesNearbyBases || !isDuplicatePlaceIdentity(stops, { name: suggestion.name, canonicalPlaceId: suggestion.canonicalPlaceId })))
    : [];
  const activeNearbyDiscovery = nearbyBaseDiscovery?.mentionId === activeClarificationMention?.mentionId ? nearbyBaseDiscovery : null;
  const nearbySuggestions = clarificationUsesNearbyBases
    ? [...clarificationModelSuggestions, ...(activeNearbyDiscovery?.suggestions ?? [])]
      .filter((suggestion, index, all) => all.findIndex((item) => item.canonicalPlaceId === suggestion.canonicalPlaceId) === index)
    : [];
  const nearbyExpanded = Boolean(activeClarificationMention && expandedNearbyBaseMentionIds.includes(activeClarificationMention.mentionId));
  const visibleNearbySuggestions = nearbySuggestions.slice(0, nearbyExpanded ? 5 : 3);
  const clarificationSuggestions: BuilderClarificationSuggestion[] = clarificationUsesNearbyBases
    ? visibleNearbySuggestions.map((suggestion) => ({
      id: suggestion.canonicalPlaceId,
      name: suggestion.name,
      detail: `${suggestion.country} · ${isDuplicatePlaceIdentity(stops, { name: suggestion.name, canonicalPlaceId: suggestion.canonicalPlaceId })
        ? language === "es" ? "Ya en la ruta; usar como base" : "Already in route; use as base"
        : suggestion.reason}`,
    }))
    : [...clarificationModelSuggestions, ...clarificationGuidedSuggestions]
      .filter((suggestion, index, all) => all.findIndex((item) => item.canonicalPlaceId === suggestion.canonicalPlaceId) === index)
      .filter((suggestion) => !clarificationDiscovery?.candidates.some((candidate) => candidate.placeId === suggestion.canonicalPlaceId))
      .slice(0, 6).map((suggestion) => ({
      id: suggestion.canonicalPlaceId,
      name: suggestion.name,
      detail: `${suggestion.country} · ${clarificationModelSuggestions.some((item) => item.canonicalPlaceId === suggestion.canonicalPlaceId)
        ? language === "es" ? "Lugar opcional; revisa cómo encaja en la ruta." : "Optional place suggestion; review its route fit."
        : suggestion.reason}`,
    }));
  const clarificationSuggestionsStatus = clarificationUsesNearbyBases
    ? nearbySuggestions.length ? undefined : !activeNearbyBaseAnchor
      ? language === "es"
        ? `Morrovia no tiene datos de ubicación suficientemente fiables para sugerir una base. Se conserva ${clarificationParentName}; busca un lugar cercano.`
        : `Morrovia does not have trustworthy enough location data to suggest a base. ${clarificationParentName} is preserved; search for a nearby place instead.`
      : activeNearbyDiscovery?.status === "loading" || !activeNearbyDiscovery
        ? language === "es" ? "Buscando poblaciones cercanas verificadas…" : "Finding verified nearby settlements…"
        : activeNearbyDiscovery.status === "empty"
          ? language === "es"
            ? `Morrovia no pudo identificar con confianza una base cercana. Se conserva ${clarificationParentName}; busca un lugar cercano.`
            : `Morrovia could not confidently identify a nearby base. ${clarificationParentName} is preserved; search for a nearby place instead.`
          : activeNearbyDiscovery.status === "unavailable"
            ? language === "es"
              ? `La búsqueda de lugares cercanos no está disponible. Se conserva ${clarificationParentName}; puedes buscar un lugar cercano.`
              : `Nearby place discovery is temporarily unavailable. ${clarificationParentName} is preserved; you can search for a nearby place.`
            : undefined
    : clarificationDiscovery && clarificationDiscovery.candidates.length < 6
      ? activeCountryEnrichment?.status === "loading" ? language === "es"
        ? "Buscando algunos lugares más. Ya puedes elegir las sugerencias revisadas."
        : "Checking for a few additional place names. Reviewed suggestions are ready to select now."
        : activeCountryEnrichment?.status === "unavailable" ? language === "es"
          ? "Las sugerencias adicionales no están disponibles ahora. Las sugerencias revisadas siguen disponibles."
          : "Additional place suggestions are unavailable right now. Reviewed suggestions remain available."
          : undefined
      : undefined;
  const clarificationGuidedShapes = activeClarificationMention && clarificationSupportsMultiple
    && !clarificationUsesNearbyBases
    ? guidedPlanningAreaShapes(activeClarificationMention, {
      mentions: activePlaceMentions,
      interests: effectiveIntent.preferences.interests,
      durationDays: datesManuallyEdited || effectiveStructuredBrief.duration ? totalDays : undefined,
      pace: effectiveStructuredBrief.pace?.value ?? (paceManuallyEdited ? effectiveIntent.preferences.pace : undefined),
    }).map((shape) => ({
      ...shape,
      places: shape.places.filter((place) => !stops.some((stop) => stop.canonicalPlaceId === place.canonicalPlaceId)),
    })).filter((shape) => shape.places.length > 0)
    : [];
  const clarificationRouteShapes: BuilderClarificationRouteShape[] = clarificationGuidedShapes.map((shape) => ({
    id: shape.id,
    title: shape.title,
    summary: shape.placeSummary,
    reason: shape.reason,
    places: shape.places.map((place) => ({ id: place.canonicalPlaceId, name: place.name, detail: place.country })),
  }));
  const clarificationChoices: BuilderClarificationChoice[] = activeProviderClarification
    ? activeProviderClarification.choices.map((choice, index) => ({
      id: `provider:${choice.providerId ?? index}`,
      label: `${choice.name}, ${choice.country}`,
      detail: [placeTypeLabel(choice.placeType as CapturedLocation["placeType"]) ?? placeTypeLabel("unknown"), placeSuggestionLocationDetail(choice, activeProviderClarification.choices)].filter(Boolean).join(" · "),
    }))
    : [
      ...(!clarificationUsesNearbyBases ? clarificationIssue?.options.map((option) => ({
        id: `issue:${option.canonicalPlaceId}`,
        label: option.label,
        detail: [option.region, option.country, placeTypeLabel(option.placeType)].filter(Boolean).join(" · "),
      })) ?? [] : []),
      ...(clarificationAttractionProposal ? [{
        id: `visit:${clarificationAttractionProposal.target.routeStopId}`,
        label: language === "es" ? `Visitar desde ${clarificationAttractionProposal.target.name}` : `Visit from ${clarificationAttractionProposal.target.name}`,
        detail: clarificationAttractionProposal.reason,
      }] : []),
    ];
  const clarificationIsAmbiguity = Boolean(activeProviderClarification
    || activeClarificationMention?.status === "ambiguous"
    || activeClarificationMention?.status === "unresolved");
  const clarificationIsLandmark = clarificationUsesNearbyBases;
  const clarificationTitle = clarificationIsAmbiguity
    ? language === "es"
      ? `¿A qué ${activeProviderClarification?.mention.sourceText ?? activeClarificationMention?.sourceText ?? "lugar"} te referías?`
      : `Which ${activeProviderClarification?.mention.sourceText ?? activeClarificationMention?.sourceText ?? "place"} did you mean?`
    : clarificationIsLandmark
      ? clarificationParentName
      : clarificationDiscovery
        ? language === "es" ? `¿A dónde ir en ${clarificationParentName}?` : `Where should you go in ${clarificationParentName}?`
        : language === "es" ? `Elige lugares en ${clarificationParentName}` : `Choose places in ${clarificationParentName}`;
  const clarificationDescription = clarificationIsAmbiguity
    ? language === "es" ? "Elige el lugar que coincide con tu viaje. Si es un área amplia, después te ayudaremos a elegir dónde alojarte." : "Choose the place that matches your trip. If it is a broad area, we will help you choose where to stay next."
    : clarificationIsLandmark
      ? `${placeTypeLabel(activeClarificationMention!.placeType)} · ${language === "es" ? "Tu intención de visita se mantiene separada de las bases de la ruta." : "Your visit intent stays separate from route bases."}`
      : clarificationDiscovery
        ? ""
        : language === "es" ? `Añade uno o más lugares en ${clarificationParentName} alrededor de los que quieres que Morrovia planifique.` : `Add one or more places you would like Morrovia to plan around in ${clarificationParentName}.`;
  const clarificationQuestion = clarificationIsLandmark && activeClarificationMention
    ? activeClarificationMention.placeType === "landmark"
      ? language === "es" ? `¿Dónde te gustaría alojarte para visitar ${clarificationParentName}?` : `Where would you like to stay for ${clarificationParentName}?`
      : language === "es" ? `¿Dónde te gustaría alojarte alrededor de ${clarificationParentName}?` : `Where would you like to stay around ${clarificationParentName}?`
    : undefined;
  const clarificationNeedsSearch = Boolean(activeClarificationMention && (
    clarificationIsAmbiguity
    || clarificationSupportsMultiple
    || activeClarificationMention.requiresBaseSelection
    || activeClarificationMention.routability === "planning_area"
    || activeClarificationMention.routability === "anchor_or_poi"
  ));
  const clarificationIsFinal = clarificationIndex >= clarificationSessionIds.length - 1;
  const syncAction = tripEditorSyncAction({
    hasCloudConflict: Boolean(cloudConflictTrip),
    hasDeviceRecoveryIssue: deviceRecoveryBlocked || mountedBuilder?.snapshot.error?.category==="conflict" || mountedBuilder?.snapshot.error?.category==="protected",
    authInterrupted: cloudAuthInterrupted,
  });
  const visibleSaveState = saveState === "cloud"
    ? "saved"
    : saveState === "local"
      ? "device"
      : saveState === "error"
        ? "error"
        : "saving";
  const visibleSaveLabel = language === "es"
    ? saveState === "device-saving"
      ? "Guardando cambios en este dispositivo…"
      : saveState === "cloud-saving"
        ? "Guardando en tu cuenta…"
        : saveState === "cloud"
          ? "Guardado en tu cuenta"
          : saveState === "local"
            ? "Guardado en este dispositivo"
            : deviceStorageBlocked || deviceRecoveryBlocked
              ? "Los cambios solo están en esta pestaña"
              : "Cambios no sincronizados con tu cuenta"
    : saveState === "device-saving"
      ? "Keeping changes on this device…"
      : saveState === "cloud-saving"
        ? "Saving to your account…"
        : saveState === "cloud"
          ? "Saved to your account"
          : saveState === "local"
            ? "Saved on this device"
            : deviceStorageBlocked || deviceRecoveryBlocked
              ? "Changes are only in this tab"
              : "Changes not synced to your account";
  const recoverFromSaveError = () => {
    if(builderEditSessionRef.current) {
      if(syncAction==="sign-in")window.location.assign(tripSyncSignInPath(activeTripDocument.id));
      else if(syncAction==="open-device" || mountedBuilder?.snapshot.historicalRecovery)window.location.assign(tripSyncRecoveryPath(activeTripDocument.id,"builder"));
      else builderEditSessionRef.current.retrySave();
      return;
    }
    if (syncAction === "reload-cloud") {
      if (!cloudConflictTrip) return;
      cacheCanonicalTrip(cloudConflictTrip);
      recoveryHandleRef.current = null;
      window.location.assign(tripWorkspaceHref(cloudConflictTrip.id));
      return;
    }
    if (syncAction === "open-device") {
      window.location.assign(tripSyncRecoveryPath(activeTripDocument.id,"builder"));
      return;
    }
    if (deviceStorageBlocked) {
      const recovery = persistDeviceRecovery(activeTripDocument);
      setDeviceRecoveryBlocked(recovery.blockedByExistingRecovery);
      setDeviceStorageBlocked(!recovery.stored && !recovery.blockedByExistingRecovery);
      if (recovery.stored) { setCloudSaveError(""); setSaveState("local"); }
      return;
    }
    if (syncAction === "sign-in") {
      window.location.assign(tripSyncSignInPath(activeTripDocument.id));
      return;
    }
    openBuiltTrip();
  };
  const recoveryActionLabel = syncAction === "reload-cloud"
    ? (language === "es" ? "Abrir copia en la nube" : "Open cloud copy")
    : syncAction === "open-device"
      ? (language === "es" ? "Abrir copia del dispositivo" : "Open device copy")
      : deviceStorageBlocked
        ? (language === "es" ? "Reintentar guardado" : "Try device save again")
        : syncAction === "sign-in"
          ? (language === "es" ? "Iniciar sesión de nuevo" : "Sign in again")
          : (language === "es" ? "Reintentar" : "Try again");
  const stopResolutionMentions = new Map(stops.flatMap((stop) => {
    const mention = activePlaceMentions.find((item) => !isOriginMention(item) && !isEndMention(item)
      && (handoffStopOccurrenceId(item, handoffOccurrenceMentionIdsRef.current) === stop.id
        || placeSelections.some((selection) => selection.routeStopId === stop.id && selection.mentionId === item.mentionId)));
    return mention ? [[stop.id, mention] as const] : [];
  }));
  const renderPlaceResolution = (mention: CapturedLocation) => {
    const state = handoffResolutionStatuses[mention.mentionId]
      ?? (mention.status === "ambiguous" || mention.status === "unresolved" ? "needs-confirmation" : undefined);
    if (!state || state === "resolved") return null;
    const name = placeDisplayName(mention);
    return <div key={mention.mentionId} className={styles.inlinePlaceResolution}>
      <span role="status">{state === "pending"
        ? (language === "es" ? `Comprobando ${name}…` : `Checking ${name}…`)
        : state === "failed"
          ? (language === "es" ? `No pudimos comprobar ${name}.` : `Couldn't check ${name}.`)
          : (language === "es" ? `Confirma qué lugar es ${name}.` : `Confirm which place you mean by ${name}.`)}</span>
      {state === "failed" ? <EasyTButton variant="quiet" size="small" onClick={() => handoffLookupSessionRef.current?.retry?.(mention.mentionId)}>
        {language === "es" ? "Intentar de nuevo" : "Try again"}<span className="sr-only"> {name}</span>
      </EasyTButton> : null}
      {state !== "pending" && pendingClarificationIds.includes(mention.mentionId) ? <EasyTButton variant="quiet" size="small" onClick={() => openClarificationSession(mention.mentionId)}>
        {language === "es" ? "Elegir lugar" : "Choose place"}<span className="sr-only"> {name}</span>
      </EasyTButton> : null}
    </div>;
  };
  const renderSavedLocationReview=(targetId:string)=>{
    const trip=mountedBuilder?.snapshot.trip;
    const place=trip?savedTargetPlace(trip,targetId):null;
    if(!place||geographicallyReady(place,targetId==='origin'||targetId==='end'?'endpoint':'stop'))return null;
    return <div className={styles.inlinePlaceResolution} onClick={event=>event.stopPropagation()}>
      <span role="status">{language==='es'?`Confirma la ubicación de ${place.name}.`:`Confirm the location of ${place.name}.`}</span>
      <EasyTButton variant="quiet" size="small" onClick={()=>{void confirmSavedLocation(targetId)}}>{language==='es'?'Elegir lugar':'Choose place'}<span className="sr-only"> {place.name}</span></EasyTButton>
    </div>;
  };

  if (!hydrated || ownerScopeMismatch || (hydratedCanonicalTripRef.current?.id === tripId && !mountedBuilder && !tripUnavailable && !deviceRecoveryBlocked && !deviceStorageBlocked)) {
    return <div data-builder-root="true" data-builder-edit-session={mountedBuilder ? "active" : "hydrating"} className={`${styles.shellWide} ${mobilePolish.builder}`} aria-busy="true"><div className={styles.locationResolution} role="status">Checking the current account before opening this trip…</div></div>;
  }
  if (tripUnavailable) {
    return <div data-builder-root="true" className={`${styles.shellWide} ${mobilePolish.builder}`}><aside className={styles.cloudSaveError} role="alert"><span>This trip is not available to the current browser account. Its original device copy remains preserved in its owner scope.</span></aside></div>;
  }

  if (generated && buildInvariant.canBuildTrip) {
    return (
      <TripItineraryWorkspace
        trip={activeTripDocument}
        presentation="legacy"
        language={language}
        selectedPlaceCount={selected.length}
        onEditBrief={() => { setGenerated(false); }}
        onOpenMap={() => {
          void (async () => {
            const saved = await persistGeneratedTrip();
            const resultOwnerId = saved?.ownerId ?? hydratedOwnerScopeRef.current ?? null;
            if (saved
              && canUseHydratedTripScope(hydratedOwnerScopeRef.current, activeBrowserOwnerIdRef.current)
              && resultOwnerId === activeBrowserOwnerIdRef.current) {
              window.location.assign(saved.ownerId && !session?.user ? tripSyncSignInPath(saved.id) : mapWorkspaceHref(saved.id));
            } else settleUnacknowledgedBuild();
          })();
        }}
      />
    );
  }

  const topOriginReview = <>
                  {activePlaceMentions.filter((mention) => isOriginMention(mention) || isEndMention(mention)).map(renderPlaceResolution)}
                  {inlineOriginPlanningMention ? <div className={styles.inlinePlanningClarification}>
                    <div className={styles.inlinePlanningIdentity} role="status">
                      <strong>{placeDisplayName(inlineOriginPlanningMention)}</strong>
                      <span>{placeTypeLabel(inlineOriginPlanningMention.placeType)}</span>
                      <p>{language === "es" ? `¿Desde dónde en ${placeDisplayName(inlineOriginPlanningMention)} empiezas?` : `Where in ${placeDisplayName(inlineOriginPlanningMention)} are you starting from?`}</p>
                    </div>
                    <div className={styles.inlinePlanningSearch}>
                      <CanonicalPlaceAutocomplete
                        autoFocus
                        requireCoordinates
                        label={language === "es" ? `Punto de salida en ${placeDisplayName(inlineOriginPlanningMention)}` : `Starting point in ${placeDisplayName(inlineOriginPlanningMention)}`}
                        value={baseSearchInputs[inlineOriginPlanningMention.mentionId] ?? ""}
                        placeholder={language === "es" ? `Busca ciudades y lugares en ${placeDisplayName(inlineOriginPlanningMention)}` : `Search cities and places in ${placeDisplayName(inlineOriginPlanningMention)}`}
                        contextCountries={inlineOriginPlanningMention.parentCountries}
                        parentConstraint={planningParentForMention(inlineOriginPlanningMention)}
                        allowedPlaceTypes={ROUTABLE_ENDPOINT_TYPES}
                        showPlaceType={false}
                        invalid={Boolean(baseSearchErrors[inlineOriginPlanningMention.mentionId])}
                        describedBy={baseSearchErrors[inlineOriginPlanningMention.mentionId] ? `${originErrorId}-base` : undefined}
                        onChange={(value) => { setBaseSearchInputs((current) => ({ ...current, [inlineOriginPlanningMention.mentionId]: value })); setBaseSearchErrors((current) => ({ ...current, [inlineOriginPlanningMention.mentionId]: "" })); }}
                        onSelect={(suggestion) => { void selectOriginBase(inlineOriginPlanningMention, suggestion); }}
                      />
                      <EasyTButton variant="secondary" onClick={() => {
                        const isTransientClarification = inlineOriginPlanningMention.mentionId === transientPlanningMentionId;
                        cancelTransientPlanningClarification(inlineOriginPlanningMention.mentionId);
                        setOriginPlanningMentionId(null);
                        if (isTransientClarification) {
                          const previousOrigin = originBeforePlanningClarificationRef.current;
                          replaceJourneyOrigin(previousOrigin ?? { name: "" });
                          setOriginTouched(previousOrigin?.touched ?? false);
                          originBeforePlanningClarificationRef.current = null;
                        }
                      }}>{language === "es" ? "Cancelar" : "Cancel"}</EasyTButton>
                    </div>
                    {baseSearchErrors[inlineOriginPlanningMention.mentionId] ? <p id={`${originErrorId}-base`} className={styles.baseSelectorError} role="alert">{baseSearchErrors[inlineOriginPlanningMention.mentionId]}</p> : null}
                  </div> : null}
                  {(originError || originMissing) && !inlineOriginPlanningMention && <small id={originErrorId} className={styles.hintError} role="alert">{originError || ui.addOrigin}</small>}
  </>;
  const necessaryReview = (kinds: Array<"leg"|"schedule"|"recommendation"|"endpoint"|"assessment">, targetId?: string) => mountedBuilder?.snapshot.trip.brief.cascadeStatus?.routeReconciliation?.residual
    .filter(unit => unit.phase!=="pending" && kinds.includes(unit.kind) && (!targetId || unit.targetId===targetId))
    .filter((unit, index, units) => unit.phase!=="conflict" || !units.slice(0, index).some(previous => previous.phase==="conflict"))
    .map(unit => <span key={`${unit.kind}:${unit.targetId}`} className={styles.necessaryReview} role="status" onClick={event=>event.stopPropagation()}>
      <span>{unit.phase==="conflict"
        ? (mountedBuilder.snapshot.trip.brief.cascadeStatus?.conflicts.join(" ") || (language==="es"?"Revisa las fechas y condiciones guardadas.":"Check the dates and saved commitments."))
        : unit.kind==="leg" ? (language==="es"?"No pudimos actualizar esta conexión.":"This connection could not be updated.")
        : unit.kind==="recommendation" ? (language==="es"?"No pudimos actualizar las sugerencias de esta parada.":"Suggestions for this stop could not be updated.")
        : (language==="es"?"No pudimos actualizar estos datos.":"These details could not be updated.")}</span>
      {unit.phase==="failed" ? <EasyTButton variant="quiet" size="small" onClick={()=>mountedBuilder.session.retryNecessaryUnit(unit)}>{language==="es"?"Reintentar":"Try again"}</EasyTButton> : null}
    </span>);
  const topPersonalize = <div className={styles.topPreferences}>
    {hasSavedTravelProfile && <section className={styles.travelStyle}>
      <div className={styles.travelStyleHead}><span>{language === "es" ? "TU ESTILO DE VIAJE" : "YOUR TRAVEL STYLE"}</span><a href="/journey/profile">{language === "es" ? "Editar" : "Edit"}</a></div>
      <div className={styles.travelStyleChips}>{travelStyleLabels(travelProfile, language).map(label => <span key={label}>{label}</span>)}</div>
    </section>}
    {(effectiveIntent.hardConstraints.fixedCommitments.length > 0 || effectiveIntent.hardConstraints.optionalStopIds.length > 0) && <details className={styles.topConstraints}>
      <summary>{language === "es" ? "Condiciones guardadas" : "Saved constraints"}</summary><div>
      {effectiveIntent.hardConstraints.optionalStopIds.map(id => <span key={id}>{stops.find(stop => stop.id === id)?.name ?? id} · {language === "es" ? "Opcional" : "Optional"}<EasyTButton variant="quiet" onClick={()=>toggleOptionalStop(id)}>{language === "es" ? "Mantener parada" : "Keep stop"}</EasyTButton></span>)}
      {effectiveIntent.hardConstraints.fixedCommitments.map(item=><span key={item.id}>{item.date ? `${item.date} · ` : ""}{item.label}<EasyTButton variant="quiet" icon={X} iconOnly aria-label={`${language === "es" ? "Quitar" : "Remove"} ${item.label}`} onClick={()=>removeFixedCommitment(item.id)}>{language === "es" ? "Quitar" : "Remove"} {item.label}</EasyTButton></span>)}
      </div></details>}
  </div>;

  /* ---------------------------------------------------------- brief wizard */

  const countryAddReviewControl=countryAddReview?<div role="group" aria-label={language==="es"?"Revisar destino":"Review destination"}>
    <p className={styles.hint}>{countryAddReview.name}, {countryAddReview.country} · {language==="es"?`Añade ${countryAddReview.country} a este viaje`:`Adds ${countryAddReview.country} to this trip`}</p>
    <div className={styles.topPreferenceChoices}>
      <EasyTButton size="small" disabled={stopChecking} onClick={()=>{void addStop(countryAddReview.name,countryAddReview.country,undefined,undefined,countryAddReview.suggestion,false,countryAddReview)}}>{language==="es"?"Añadir":"Add"} {countryAddReview.name}</EasyTButton>
      <EasyTButton size="small" variant="quiet" onClick={cancelCountryAddReview}>{language==="es"?"Cancelar":"Cancel"}</EasyTButton>
    </div>
  </div>:null;

  return (
    <div data-builder-root="true" data-builder-edit-session={mountedBuilder ? "active" : "hydrating"} data-homepage-handoff={isHomepagePromptHandoff ? "true" : undefined} className={`${styles.shellWide} ${mobilePolish.builder} ${isHomepagePromptHandoff ? styles.homepageHandoff : ""}`}>
      <div className={`${styles.wizardBody} ${!hasRouteSkeleton ? styles.emptyWorkspace : ""} ${entryKind === "fresh" ? styles.freshWorkspace : ""}`}>
        <div className={styles.pane}>
          <div id="builder-summary" tabIndex={-1} className={styles.stack}>
              <header className={styles.stepHero}>
                <h1 className={styles.stepHeroTitle}>{hasRouteSkeleton
                  ? (language === "es" ? "Dale forma a la ruta." : "Shape the route.")
                  : hasPromptContext || pendingClarificationIds.length || inlineStopBaseMention
                    ? (language === "es" ? "Demos forma a tu ruta." : "Let’s shape your route.")
                    : entryKind === "fresh"
                      ? (language === "es" ? "Nuevo viaje" : "New trip")
                    : (language === "es" ? "Empieza tu viaje." : "Start your trip.")}</h1>
                {(hasRouteSkeleton || hasPromptContext) && <span className={styles.saveState}><MorroviaSaveStatus state={visibleSaveState} label={visibleSaveLabel} /></span>}
              </header>
              {pendingInterpretation ? <MorroviaSectionStatus
                state={tripBriefCaptureError ? "error" : "loading"}
                title={tripBriefCaptureError || (language === "es" ? "Preparando tu ruta" : "Preparing your route")}
                detail={pendingInterpretation.receipt.frozenSnapshot.mode === "describe"
                  ? pendingInterpretation.receipt.frozenSnapshot.prompt
                  : language === "es" ? "Tus lugares y preferencias se han guardado en este dispositivo." : "Your places and preferences are saved on this device."}
                onRetry={tripBriefCaptureError && pendingFailureKind !== "domain" ? () => {
                  markPlanningMilestone(pendingInterpretation.receipt.handoffId, "submit");
                  markPlanningMilestone(pendingInterpretation.receipt.handoffId, "durable-intake");
                  setTripBriefCaptureError("");
                  setPendingInterpretationRetry((revision) => revision + 1);
                } : undefined}
                retryLabel={language === "es" ? "Intentar de nuevo" : "Try again"}
              /> : null}
              {pendingInterpretation ? <EasyTButton type="button" variant="quiet" onClick={editPendingInterpretation}>
                {language === "es" ? "Editar idea de viaje" : "Edit trip idea"}
              </EasyTButton> : null}
              {!hasRouteSkeleton && !hasPromptContext && !showStopEditor && !pendingClarificationIds.length && !inlineStopBaseMention && hydrated && <div className={styles.initialCapture}>
                {entryKind === "fresh" ? <NewTripStarter key={activeBrowserOwnerId ?? "guest"} ownerId={activeBrowserOwnerId} language={language} travelProfile={hasSavedTravelProfile ? travelProfile : null} onSubmit={submitNewTripIntake} /> : <MorroviaTripCapture
                  disabled={stopChecking}
                  language={language}
                  value={tripBrief}
                  onValueChange={(value) => { setTripBrief(value); setTripBriefCaptureError(""); }}
                  startDate={startDate}
                  endDate={endDate}
                  onDatesChange={(range) => updateTravelRange(range.start, range.end)}
                  travellers={effectiveIntent.travellers}
                  onTravellersChange={updateTravellers}
                  interests={effectiveIntent.preferences.interests}
                  onInterestsChange={(nextInterests) => updateIntentPreferences({ interests: nextInterests })}
                  travelProfile={hasSavedTravelProfile ? travelProfile : null}
                  onSubmit={submitInitialTripBrief}
                  loading={applyingTripBrief}
                  error={tripBriefCaptureError}
                />}
                {entryKind !== "fresh" && <section className={styles.firstPlaceEntry} aria-label={language === "es" ? "Añade tu primer lugar" : "Add your first place"}>
                  <h2>{language === "es" ? "Añade tu primer lugar" : "Add your first place"}</h2>
                  <CanonicalPlaceAutocomplete
                    requireCoordinates
                    label={language === "es" ? "Añade tu primer lugar" : "Add your first place"}
                    value={stopInput}
                    placeholder={language === "es" ? "Busca una ciudad o un lugar" : "Search for a city or place"}
                    searchIntent="route-stop"
                    disabled={stopChecking || applyingTripBrief}
                    invalid={Boolean(stopError)}
                    describedBy={stopError ? stopErrorId : undefined}
                    onChange={(value) => { cancelCountryAddReview();builderEditSessionRef.current?.updateDraft({binding:{kind:"destination-add"},raw:value});setStopInput(value); setStopError(""); }}
                    onSelect={(suggestion) => { void addStop(suggestion.name, suggestion.country, undefined, undefined, suggestion); }}
                    onSubmitFreeText={() => { void addStop(); }}
                  />
                  {countryAddReviewControl}
                  {stopChecking ? <p role="status">{ui.checking}</p> : null}
                  {stopError ? <p id={stopErrorId} role="alert" className={styles.hintError}>{stopError}</p> : null}
                </section>}
                {entryKind !== "fresh" && <div className={styles.importTripEntry}><EasyTLinkButton href="/journey/new/import" variant="secondary" size="small" icon={FileSpreadsheet}>Import existing trip</EasyTLinkButton></div>}
              </div>}
              {!mountedBuilder && hasSavedTravelProfile && !arrivedFromHomepage && <section className={styles.travelStyle} aria-label={language === "es" ? "Tu estilo de viaje" : "Your travel style"}>
                <div className={styles.travelStyleHead}><span>{language === "es" ? "TU ESTILO DE VIAJE" : "YOUR TRAVEL STYLE"}</span><a href="/journey/profile">{language === "es" ? "Editar" : "Edit"}</a></div>
                <div className={styles.travelStyleChips}>{travelStyleLabels(travelProfile, language).map((label) => <span key={label}>{label}</span>)}</div>
              </section>}
              {(hasRouteSkeleton || hasPromptContext || showStopEditor || pendingClarificationIds.length > 0 || inlineStopBaseMention) && <section className={styles.tripUnderstood} aria-label={language === "es" ? "Viaje entendido" : "Trip understood"}>
                {mountedBuilder ? <TripBuilderTopControls trip={mountedBuilder.snapshot.trip} draft={mountedBuilder.snapshot.draft} language={language}
                  onConfirmSavedFinish={()=>{void confirmSavedFinish()}}
                  onReorder={ids=>commitStopOrder(ids,"drag")} fixedOrder={fixedBuilderChronology}
                  onUpdateRoute={()=>{void requestRouteOptimization();}} updatingRoute={optimizationChecking}
                  disabled={Boolean(mountedBuilder.snapshot.error?.category === "protected")}
                  onType={type=>{
                    const snapshot=mountedBuilder.session.getSnapshot();
                    if(type==="return_to_start"&&snapshot.trip.brief.intent.route.journeyEnd.mode==="explicit")setPendingTopType({type,revision:snapshot.inputRevision,name:snapshot.trip.brief.intent.route.journeyEnd.place.name});
                    else dispatchAcceptedBuilderEdit({kind:"type",tripType:type});
                  }}
                  onOriginInput={raw=>mountedBuilder.session.updateDraft({binding:{kind:"origin"},raw})}
                  onOriginSelect={suggestion=>{void selectOriginSuggestion(suggestion)}}
                  onOriginClear={()=>{mountedBuilder.session.updateDraft({binding:{kind:"origin"},raw:""});dispatchAcceptedBuilderEdit({kind:"origin",place:null},{acceptedInput:{binding:{kind:"origin"},raw:""}})}}
                  onDateInput={(field,raw)=>mountedBuilder.session.updateDraft({binding:{kind:"date",field},raw})} onDates={updateTravelRange} onTravellers={updateTravellers} onBudget={band=>dispatchAcceptedBuilderEdit({kind:"budget",budget:band})}
                  onAdd={()=>{setTopAddOpen(true);setShowStopEditor(true);window.requestAnimationFrame(()=>document.getElementById(stopInputId)?.focus())}}
                  onEditIntent={intent=>{
                    const mention=activePlaceMentions.find(m=>m.mentionId===intent.id);
                    if(intent.kind==="planning_area"||intent.stopIds.length!==1){if(mention){if(completedPlanningAreaMentionIds.includes(mention.mentionId))reopenPlanningArea(mention);else openClarificationSession(mention.mentionId)}return false}return true;
                  }}
                  onRemoveStop={requestRemoveStop}
                  onRemoveIntent={intent=>{if(intent.stopIds.length===1)requestRemoveStop(intent.stopIds[0]);else if(!intent.stopIds.length)dispatchAcceptedBuilderEdit({kind:"remove-destination",intentId:intent.id});else {
                    const snapshot=mountedBuilder.session.getSnapshot();const stays=snapshot.trip.stops.filter(stop=>intent.stopIds.includes(stop.id));
                    const blocked=stays.find(stop=>stopRemovalSafety(stop.id).blocked);if(blocked){setStopRemovalBlocked({id:blocked.id,name:blocked.name});return}
                    setPendingTopRemoval({intentId:intent.id,revision:snapshot.inputRevision,name:intent.selectedPlace?.name??intent.sourceText,stays:stays.map(stop=>stop.name),nights:stays.reduce((sum,stop)=>sum+(stop.nights??0),0)});
                  }}}
                  onIntentInput={(intentId,raw)=>mountedBuilder.session.updateDraft({binding:{kind:"destination",intentId},raw})}
                  onIntentSelect={(intent,suggestion)=>{
                    if(placeSuggestionRequiresBaseSelection(suggestion)){setStopError(language==="es"?"Elige una ciudad o una base para esta parada.":"Choose a city or overnight base for this stop.");return false}
                    const raw=mountedBuilder.session.getSnapshot().draft.fields.find(f=>f.binding.kind==="destination"&&f.binding.intentId===intent.id)?.raw??suggestion.name;
                    const place=journeyEndpointPlaceFromSuggestion(suggestion);if(!place)return false;
                    return dispatchAcceptedBuilderEdit({kind:"replace-destination",intentId:intent.id,stopId:intent.stopIds[0],place},{acceptedInput:{binding:{kind:"destination",intentId:intent.id},raw}});
                  }}
                  personalize={(hasSavedTravelProfile || effectiveIntent.hardConstraints.fixedCommitments.length || effectiveIntent.hardConstraints.optionalStopIds.length) ? topPersonalize : null}
                  updateRouteFeedback={optimizationResult && optimizationResult.kind!=="proposal" ? <span role="status" className={styles.hint}>{optimizationResult.kind==="unavailable" ? (language==="es"?"No se pudo comprobar la ruta":"Route check unavailable") : (language==="es"?"No se encontró un orden mejor":"No better order found")}</span> : null}
                  originReview={<>{topOriginReview}{renderSavedLocationReview('origin')}{renderSavedLocationReview('end')}{necessaryReview(["endpoint"])}{mountedBuilder.snapshot.trip.legs.filter(leg=>leg.toEndpoint?.kind==="end").map(leg=>necessaryReview(["leg"],leg.id))}</>} destinationReview={activePlaceMentions.filter(mention=>!isOriginMention(mention)&&!isEndMention(mention)&&[...stopResolutionMentions.values()].some(mapped=>mapped.mentionId===mention.mentionId)).map(renderPlaceResolution)}
                  dateReview={<>{necessaryReview(["schedule","assessment"])}{endDateStillSuggested?<div><p className={styles.hint}>{language === "es" ? `Solo has elegido la fecha de inicio. La fecha final y los ${defaultTripIntent().timing.durationDays} días son una sugerencia.` : `Only your start date is set. The end date and ${defaultTripIntent().timing.durationDays}-day length are suggestions.`}</p><EasyTButton variant="secondary" onClick={()=>{if(dispatchAcceptedBuilderEdit({kind:"dates",startDate,endDate}))setEndDateStillSuggested(false)}}>{language==="es"?"Aceptar fechas sugeridas":"Accept suggested dates"}</EasyTButton></div>:null}</>}
                /> : <TripBuilderDetailsEditor
                  language={language}
                  startPlace={journeyOrigin}
                  endSelection={journeyEnd}
                  startDate={startDate}
                  endDate={endDate}
                  dateHint={endDateStillSuggested ? (language === "es" ? `Solo has elegido la fecha de inicio. La fecha final y los ${defaultTripIntent().timing.durationDays} días son una sugerencia.` : `Only your start date is set. The end date and ${defaultTripIntent().timing.durationDays}-day length are suggestions.`) : undefined}
                  onAcceptSuggestedDates={endDateStillSuggested ? () => { if (builderEditSessionRef.current) { const trip = builderEditSessionRef.current.getSnapshot().trip; if (!dispatchAcceptedBuilderEdit({ kind: "dates", startDate: trip.startDate, endDate: trip.endDate })) return; } setEndDateStillSuggested(false); setDatesManuallyEdited(true); } : undefined}
                  travellers={effectiveIntent.travellers}
                  budget={budget}
                  sourceFingerprint={builderDetailsFingerprint(activeTripDocument)}
                  busy={detailsCommitBusy}
                  error={detailsCommitError}
                  onCommit={commitTripDetailsDraft}
                  className={`${styles.placesSection} ${isHomepagePromptHandoff ? styles.handoffOrigin : ""} ${summaryFocus === "origin" ? styles.summaryEditorOn : ""} ${originMissing ? styles.cardError : ""}`}
                >
                  {({ draft: detailsDraft, setDraft: setDetailsDraft }) => <>
                  <JourneyEndpointsEditor
                    language={language}
                    startValue={detailsDraft.journeyOrigin.name}
                    endValue={detailsDraft.journeyEndInput}
                    endSelection={detailsDraft.journeyEnd}
                    showHint={false}
                    showHeading={false}
                    onStartChange={(value) => {builderEditSessionRef.current?.updateDraft({binding:{kind:"origin"},raw:value});setDetailsDraft((current) => ({ ...current, journeyOrigin: { name: value } }));}}
                    onStartSelect={(suggestion) => {
                      const place=journeyEndpointPlaceFromSuggestion(suggestion);if(!place)return;
                      const editor=builderEditSessionRef.current;
                      if(editor){const field=editor.getSnapshot().draft.fields.find(field=>field.binding.kind==="origin");dispatchAcceptedBuilderEdit({kind:"origin",place},{acceptedInput:{binding:{kind:"origin"},raw:field?.raw??suggestion.name}});}
                      else setDetailsDraft((current) => ({ ...current, journeyOrigin: place }));
                    }}
                    onEndChange={(value) => setDetailsDraft((current) => ({
                      ...current,
                      journeyEndInput: value,
                      journeyEnd: value.trim() ? { mode: "explicit", place: { name: value.trim() } } : { mode: "unknown" },
                    }))}
                    onEndSelect={(suggestion) => {
                      const place=journeyEndpointPlaceFromSuggestion(suggestion);if(!place)return;
                      setDetailsDraft((current) => ({...current,journeyEndInput:suggestion.name,journeyEnd:{mode:"explicit",place}}));
                    }}
                    onEndModeChange={(mode) => {if(builderEditSessionRef.current) chooseJourneyEndMode(mode);else setDetailsDraft((current) => ({ ...current, journeyEndInput: "", journeyEnd: { mode } }));}}
                  />
                  {activePlaceMentions.filter((mention) => isOriginMention(mention) || isEndMention(mention)).map(renderPlaceResolution)}
                  {inlineOriginPlanningMention ? <div className={styles.inlinePlanningClarification}>
                    <div className={styles.inlinePlanningIdentity} role="status">
                      <strong>{placeDisplayName(inlineOriginPlanningMention)}</strong>
                      <span>{placeTypeLabel(inlineOriginPlanningMention.placeType)}</span>
                      <p>{language === "es" ? `¿Desde dónde en ${placeDisplayName(inlineOriginPlanningMention)} empiezas?` : `Where in ${placeDisplayName(inlineOriginPlanningMention)} are you starting from?`}</p>
                    </div>
                    <div className={styles.inlinePlanningSearch}>
                      <CanonicalPlaceAutocomplete
                        autoFocus
                        requireCoordinates
                        label={language === "es" ? `Punto de salida en ${placeDisplayName(inlineOriginPlanningMention)}` : `Starting point in ${placeDisplayName(inlineOriginPlanningMention)}`}
                        value={baseSearchInputs[inlineOriginPlanningMention.mentionId] ?? ""}
                        placeholder={language === "es" ? `Busca ciudades y lugares en ${placeDisplayName(inlineOriginPlanningMention)}` : `Search cities and places in ${placeDisplayName(inlineOriginPlanningMention)}`}
                        contextCountries={inlineOriginPlanningMention.parentCountries}
                        parentConstraint={planningParentForMention(inlineOriginPlanningMention)}
                        allowedPlaceTypes={ROUTABLE_ENDPOINT_TYPES}
                        showPlaceType={false}
                        invalid={Boolean(baseSearchErrors[inlineOriginPlanningMention.mentionId])}
                        describedBy={baseSearchErrors[inlineOriginPlanningMention.mentionId] ? `${originErrorId}-base` : undefined}
                        onChange={(value) => { setBaseSearchInputs((current) => ({ ...current, [inlineOriginPlanningMention.mentionId]: value })); setBaseSearchErrors((current) => ({ ...current, [inlineOriginPlanningMention.mentionId]: "" })); }}
                        onSelect={(suggestion) => { void selectOriginBase(inlineOriginPlanningMention, suggestion); }}
                      />
                      <button type="button" onClick={() => {
                        const isTransientClarification = inlineOriginPlanningMention.mentionId === transientPlanningMentionId;
                        cancelTransientPlanningClarification(inlineOriginPlanningMention.mentionId);
                        setOriginPlanningMentionId(null);
                        if (isTransientClarification) {
                          const previousOrigin = originBeforePlanningClarificationRef.current;
                          replaceJourneyOrigin(previousOrigin ?? { name: "" });
                          setOriginTouched(previousOrigin?.touched ?? false);
                          originBeforePlanningClarificationRef.current = null;
                        }
                      }}>{language === "es" ? "Cancelar" : "Cancel"}</button>
                    </div>
                    {baseSearchErrors[inlineOriginPlanningMention.mentionId] ? <p id={`${originErrorId}-base`} className={styles.baseSelectorError} role="alert">{baseSearchErrors[inlineOriginPlanningMention.mentionId]}</p> : null}
                  </div> : null}
                  {(originError || originMissing) && !inlineOriginPlanningMention && <small id={originErrorId} className={styles.hintError} role="alert">{originError || ui.addOrigin}</small>}
                  </>}
                </TripBuilderDetailsEditor>}

                {stopSectionVisible && (!mountedBuilder || topAddVisible || inlineStopBaseMention || pendingPlaceCount || resolvedPlanningAreaMentions.length || stopRemovalBlocked) && <section id="builder-stops" className={`${styles.placesSection} ${summaryFocus === "stops" ? styles.summaryEditorOn : ""} ${stopError ? styles.cardError : ""}`}>
                  {!mountedBuilder && <div className={styles.placesSectionHead}>
                    {isHomepagePromptHandoff
                      ? <div><strong>{pendingPlaceCount
                        ? [
                          `${stops.length} ${language === "es" ? (stops.length === 1 ? "lugar elegido" : "lugares elegidos") : (stops.length === 1 ? "place selected" : "places selected")}`,
                          areasToShapeCount ? `${areasToShapeCount} ${language === "es" ? (areasToShapeCount === 1 ? "área por definir" : "áreas por definir") : (areasToShapeCount === 1 ? "area to shape" : "areas to shape")}` : "",
                          identitiesToConfirmCount ? `${identitiesToConfirmCount} ${language === "es" ? (identitiesToConfirmCount === 1 ? "identidad por confirmar" : "identidades por confirmar") : (identitiesToConfirmCount === 1 ? "identity to confirm" : "identities to confirm")}` : "",
                        ].filter(Boolean).join(" · ")
                        : (language === "es" ? `Paradas (${stops.length})` : `Stops (${stops.length})`)}</strong></div>
                      : <strong>{language === "es" ? "Paradas" : "Stops"}</strong>}
                  </div>}
                  {!stops.length && totalNights > 0 ? <MorroviaStatusBanner tone="warning" title={builderNightAllocationLabel({ total: totalNights, allocated: 0, complete: false, language })} /> : null}
                  {!mountedBuilder && stops.length > 0 && <div className={styles.handoffStops} role="list" aria-label={language === "es" ? "Paradas confirmadas" : "Confirmed stops"}>
                      {stops.map((stop, index) => {
                        const locked = scheduleLocks.stopIds.includes(stop.id);
                        return <div
                          key={stop.id}
                          data-builder-stop-id={stop.id}
                          role="listitem"
                          draggable={!locked}
                          className={`${styles.handoffStop} ${dragId === stop.id ? styles.handoffStopDragging : ""} ${dragTargetId === stop.id ? styles.handoffStopDropTarget : ""} ${dragTargetId === stop.id && stops.findIndex((item) => item.id === dragId) < index ? styles.handoffStopDropTargetAfter : ""}`}
                          onDragStart={(event) => { setDragId(stop.id); setDragTargetId(null); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", stop.id); }}
                          onDragEnter={(event) => { if (locked || dragId === stop.id) { setDragTargetId(null); return; } event.preventDefault(); setDragTargetId(stop.id); }}
                          onDragOver={(event) => { if (locked || dragId === stop.id) { setDragTargetId(null); return; } event.preventDefault(); setDragTargetId(stop.id); }}
                          onDrop={(event) => { event.preventDefault(); const sourceId = dragId ?? event.dataTransfer.getData("text/plain"); moveStop(stops.findIndex((item) => item.id === sourceId), index); setDragId(null); setDragTargetId(null); }}
                          onDragEnd={() => { setDragId(null); setDragTargetId(null); }}
                        >
                          <GripVertical aria-hidden="true" />
                          <b aria-hidden="true">{index + 1}</b>
                          <span>{stop.name}</span>
                          <span className={styles.handoffStopMoves}>
                            <button type="button" aria-label={`${language === "es" ? "Mover" : "Move"} ${stop.name} ${language === "es" ? "arriba" : "up"}`} disabled={locked || index === 0} onClick={() => moveStop(index, index - 1)}><ArrowUp /></button>
                            <button type="button" aria-label={`${language === "es" ? "Mover" : "Move"} ${stop.name} ${language === "es" ? "abajo" : "down"}`} disabled={locked || index === stops.length - 1} onClick={() => moveStop(index, index + 1)}><ArrowDown /></button>
                          </span>
                          <button type="button" className={styles.handoffStopRemove} aria-label={locked ? `${stop.name}, ${language === "es" ? "parada bloqueada" : "locked stop"}` : `${language === "es" ? "Quitar" : "Remove"} ${stop.name}, ${language === "es" ? "parada" : "stop"} ${index + 1}`} disabled={locked} onClick={() => requestRemoveStop(stop.id)}>{locked ? <Lock aria-hidden="true" /> : <X aria-hidden="true" />}</button>
                          {stopResolutionMentions.has(stop.id) ? renderPlaceResolution(stopResolutionMentions.get(stop.id)!) : null}
                        </div>;
                      })}
                    </div>}
                  {activePlaceMentions.filter((mention) => !isOriginMention(mention) && !isEndMention(mention)
                    && ![...stopResolutionMentions.values()].some((item) => item.mentionId === mention.mentionId)).map(renderPlaceResolution)}
                  {stopRemovalBlocked ? <MorroviaStatusBanner
                    tone="warning"
                    title={language === "es" ? `Revisa la estancia de ${stopRemovalBlocked.name}` : `Review the stay for ${stopRemovalBlocked.name}`}
                    detail={language === "es" ? "Esta estancia puede pertenecer a otra visita. Revisa su parada antes de quitarla." : "This stay may belong to another visit. Review its stop before removing this one."}
                    actions={<EasyTLinkButton href={stayWorkspaceHref(tripId, stopRemovalBlocked.id)} variant="secondary" size="small">{language === "es" ? "Revisar estancias" : "Review stays"}</EasyTLinkButton>}
                  /> : null}
                  {!mountedBuilder && resolvedPlanningAreaMentions.length ? <div className={styles.completedAreaSummaries} aria-label={language === "es" ? "Áreas planificadas" : "Shaped planning areas"}>
                    {resolvedPlanningAreaMentions.map((mention) => {
                      const selectedNames = (effectiveStructuredBrief.placeSelections ?? [])
                        .filter((selection) => selection.mentionId === mention.mentionId)
                        .map((selection) => selection.selectedName);
                      return <span key={mention.mentionId}><span><b>{placeDisplayName(mention)}</b><small>{selectedNames.join(", ")}</small></span>
                        <EasyTButton variant="quiet" size="small" onClick={() => reopenPlanningArea(mention)}>{language === "es" ? "Editar lugares" : "Edit places"}</EasyTButton></span>;
                    })}
                  </div> : null}
                  {(!mountedBuilder || topAddVisible || inlineStopBaseMention) && <div className={styles.stopEditor}>{inlineStopBaseMention ? <div className={styles.inlinePlanningClarification}>
                    <div className={styles.inlinePlanningIdentity} role="status">
                      <strong>{placeDisplayName(inlineStopBaseMention)}</strong>
                      <span>{placeTypeLabel(inlineStopBaseMention.placeType)}</span>
                      <p>{language === "es" ? `¿Dónde te gustaría alojarte en ${placeDisplayName(inlineStopBaseMention)}?` : `Where in ${placeDisplayName(inlineStopBaseMention)} would you like to stay?`}</p>
                    </div>
                    <div className={styles.inlinePlanningSearch}>
                      <CanonicalPlaceAutocomplete
                        autoFocus
                        requireCoordinates
                        label={language === "es" ? `Elegir una base en ${placeDisplayName(inlineStopBaseMention)}` : `Choose a base in ${placeDisplayName(inlineStopBaseMention)}`}
                        value={baseSearchInputs[inlineStopBaseMention.mentionId] ?? ""}
                        placeholder={language === "es" ? `Busca ciudades y lugares en ${placeDisplayName(inlineStopBaseMention)}` : `Search cities and places in ${placeDisplayName(inlineStopBaseMention)}`}
                        contextCountries={inlineStopBaseMention.parentCountries}
                        parentConstraint={planningParentForMention(inlineStopBaseMention)}
                        allowedPlaceTypes={ROUTABLE_ENDPOINT_TYPES}
                        showPlaceType={false}
                        invalid={Boolean(baseSearchErrors[inlineStopBaseMention.mentionId])}
                        describedBy={baseSearchErrors[inlineStopBaseMention.mentionId] ? `${stopErrorId}-base` : undefined}
                        emptyMessage={language === "es" ? `No encontramos lugares coincidentes en ${placeDisplayName(inlineStopBaseMention)}.` : `No matching places found in ${placeDisplayName(inlineStopBaseMention)}.`}
                        failureMessage={language === "es" ? `No pudimos buscar dentro de ${placeDisplayName(inlineStopBaseMention)}. Inténtalo de nuevo.` : `We couldn't search within ${placeDisplayName(inlineStopBaseMention)}. Try again.`}
                        onChange={(value) => { setBaseSearchInputs((current) => ({ ...current, [inlineStopBaseMention.mentionId]: value })); setBaseSearchErrors((current) => ({ ...current, [inlineStopBaseMention.mentionId]: "" })); }}
                        onSelect={(suggestion) => { void addStop(suggestion.name, suggestion.country, inlineStopBaseMention.mentionId, undefined, suggestion); }}
                      />
                      <button type="button" onClick={() => { cancelTransientPlanningClarification(inlineStopBaseMention.mentionId); setShowStopEditor(false); setResolvingPlaceMentionId(null); setStopInput(""); setStopError(""); }}>{language === "es" ? "Cancelar" : "Cancel"}</button>
                    </div>
                    {baseSearchErrors[inlineStopBaseMention.mentionId] ? <p id={`${stopErrorId}-base`} className={styles.baseSelectorError} role="alert">{baseSearchErrors[inlineStopBaseMention.mentionId]}</p> : null}
                  </div> : <>
                    {resolvingPlaceMentionId ? <small className={styles.baseSelectionContext}>{language === "es" ? "Busca un lugar para" : "Search for a place for"} {inlineStopPlanningMention ? placeDisplayName(inlineStopPlanningMention) : ""}</small> : null}
                    <label className={styles.stopEditorLabel} htmlFor={stopInputId}>{copy.addStop}</label>
                    <CanonicalPlaceAutocomplete
                      id={stopInputId}
                      includeNonRoutable
                      label={copy.addStop}
                      value={stopInput}
                      placeholder={copy.destinationPlaceholder}
                      excludeCanonicalIds={stops.flatMap((stop) => stop.canonicalPlaceId ? [stop.canonicalPlaceId] : [])}
                      invalid={Boolean(stopError)}
                      describedBy={stopError ? stopErrorId : undefined}
                      revealSuggestionsKey={stopSearchReadyKey}
                      onChange={(value) => { cancelCountryAddReview();builderEditSessionRef.current?.updateDraft({binding:{kind:"destination-add"},raw:value});setStopInput(value); setStopError(""); }}
                      onSelect={(suggestion) => { void addStop(suggestion.name, suggestion.country, undefined, undefined, suggestion); }}
                      onSubmitFreeText={() => { void addStop(); }}
                    />
                    {countryAddReviewControl}
                    {stopChecking ? <small className={styles.hint} role="status">{ui.checking}</small> : null}
                    {stopError ? <small id={stopErrorId} className={styles.hintError} role="alert">{stopError}</small> : null}
                    {!stopInput.trim() && contextualSuggestions.length > 0 && <div className={styles.suggestions}>{contextualSuggestions.map((suggestion) => <button type="button" key={suggestion.canonicalPlaceId} onClick={() => addStop(suggestion.name, suggestion.country, undefined, undefined, suggestion)}><Plus /> {suggestion.label}</button>)}</div>}
                  </>}</div>}
                </section>}

                {!clarificationOpen && pendingClarificationIds.length > 0 && <BuilderClarificationResume
                  ref={clarificationResumeRef}
                  ariaLabel={language === "es" ? "Ruta por completar" : "Route shaping to finish"}
                  label={pendingClarificationLabel}
                  itemNames={pendingClarificationNames}
                  actionLabel={language === "es" ? "Continuar dando forma a la ruta" : "Continue shaping your route"}
                  onContinue={() => openClarificationSession()}
                />}

                {contextualResolvedPlaceMentions.length > 0 && <section className={styles.resolvedPlaces} aria-label={language === "es" ? "Bases de estancia confirmadas" : "Confirmed stay bases"}>
                  <header><CheckCircle2 aria-hidden="true" /><span><strong>{language === "es" ? "BASES CONFIRMADAS" : "STAY BASES CONFIRMED"}</strong><small>{language === "es" ? "Tus destinos y visitas permanecen vinculados a sus bases nocturnas." : "Your requested destinations and visits remain linked to their overnight bases."}</small></span></header>
                  <div>{contextualResolvedPlaceMentions.map((mention) => {
                    const selections = effectiveStructuredBrief.placeSelections?.filter((item) => item.mentionId === mention.mentionId) ?? [];
                    const selection = selections[0];
                    if (!selection) return null;
                    const multiPlace = placeMentionSupportsMultipleSelections(mention);
                    const originRelationship = isOriginMention(mention) && selection.kind === "base";
                    const relationship = selection.kind === "visit" ? "visiting from" : originRelationship ? "starting from" : selection.kind === "base" ? "staying in" : "confirmed as";
                    const selectedNames = selections.map((item) => item.selectedName).join(", ");
                    return <article key={mention.mentionId} aria-label={`${placeDisplayName(mention)}, ${multiPlace ? "route places" : relationship} ${selectedNames}`}>
                      <Check aria-hidden="true" />
                      <p><strong>{placeDisplayName(mention)}</strong><span>{multiPlace ? selectedNames : selection.kind === "visit" ? (language === "es" ? `visita desde ${selection.selectedName}` : `visiting from ${selection.selectedName}`) : originRelationship ? (language === "es" ? `saliendo desde ${selection.selectedName}` : `starting from ${selection.selectedName}`) : selection.kind === "base" ? (language === "es" ? `estancia en ${selection.selectedName}` : `staying in ${selection.selectedName}`) : (language === "es" ? `confirmado como ${selection.selectedName}` : `confirmed as ${selection.selectedName}`)}</span></p>
                      <button type="button" onClick={() => {
                        if (originRelationship) {
                          setOriginPlanningMentionId(mention.mentionId);
                          setSummaryFocus("origin");
                        } else if (multiPlace || selection.kind === "visit") {
                          reopenPlanningArea(mention);
                        } else {
                          setResolvingPlaceMentionId((current) => current === mention.mentionId ? null : mention.mentionId);
                        }
                        setBaseSearchInputs((current) => ({ ...current, [mention.mentionId]: "" }));
                      }}>{originRelationship ? (language === "es" ? "Cambiar salida" : "Change departure") : multiPlace ? (language === "es" ? "Añadir o cambiar lugares" : "Add or change places") : (language === "es" ? "Cambiar base" : "Change base")}<span className="sr-only"> {placeDisplayName(mention)}</span></button>
                      {selection.kind === "base" && !originRelationship && resolvingPlaceMentionId === mention.mentionId ? <div className={styles.baseSelector}>
                        <CanonicalPlaceAutocomplete
                          requireCoordinates
                          label={language === "es" ? `Cambiar la base para ${placeDisplayName(mention)}` : `Change the base for ${placeDisplayName(mention)}`}
                          value={baseSearchInputs[mention.mentionId] ?? ""}
                          placeholder={language === "es" ? `Busca dentro de ${placeDisplayName(mention)}…` : `Search within ${placeDisplayName(mention)}…`}
                          contextCountries={mention.parentCountries}
                          parentConstraint={planningParentForMention(mention)}
                          allowedPlaceTypes={ROUTABLE_ENDPOINT_TYPES}
                          showPlaceType={false}
                          emptyMessage={language === "es" ? `No encontramos lugares coincidentes en ${placeDisplayName(mention)}.` : `No matching places found in ${placeDisplayName(mention)}.`}
                          failureMessage={language === "es" ? `No pudimos buscar dentro de ${placeDisplayName(mention)}. Inténtalo de nuevo.` : `We couldn't search within ${placeDisplayName(mention)}. Try again.`}
                          onChange={(value) => { setBaseSearchInputs((current) => ({ ...current, [mention.mentionId]: value })); setBaseSearchErrors((current) => ({ ...current, [mention.mentionId]: "" })); }}
                          onSelect={(suggestion) => { void addStop(suggestion.name, suggestion.country, mention.mentionId, undefined, suggestion); }}
                        />
                        {baseSearchErrors[mention.mentionId] ? <p className={styles.baseSelectorError} role="alert">{baseSearchErrors[mention.mentionId]}</p> : null}
                      </div> : null}
                    </article>;
                  })}</div>
                </section>}

                {!mountedBuilder && pickedUpPreferences.length > 0 && <section className={styles.pickedPreferences} aria-label={language === "es" ? "Preferencias" : "Preferences"}><div>{pickedUpPreferences.map((preference) => <span key={preference}>{preference}</span>)}</div></section>}

              {!mountedBuilder && (effectiveIntent.hardConstraints.fixedCommitments.length > 0 || showTripDetails) && <section id="builder-constraints" className={`${styles.intentPanel} ${summaryFocus === "constraints" ? styles.summaryEditorOn : ""}`} aria-label={language === "es" ? "Intención y condiciones del viaje" : "Trip intent and constraints"}>
                <button type="button" className={styles.detailsToggle} aria-expanded={showTripDetails} aria-controls={isHomepagePromptHandoff ? "builder-advanced-content" : undefined} onClick={() => setShowTripDetails((current) => !current)}><span><b>{language === "es" ? "Planes fijos" : "Fixed plans"}</b>{effectiveIntent.hardConstraints.fixedCommitments.length ? <small>{language === "es" ? `${effectiveIntent.hardConstraints.fixedCommitments.length} guardado${effectiveIntent.hardConstraints.fixedCommitments.length === 1 ? "" : "s"}` : `${effectiveIntent.hardConstraints.fixedCommitments.length} saved`}</small> : null}</span>{showTripDetails ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}</button>
                {showTripDetails && <div id={isHomepagePromptHandoff ? "builder-advanced-content" : undefined} className={isHomepagePromptHandoff ? styles.advancedContent : undefined}>
                <div className={styles.intentGrid}>
                  <section className={styles.intentHard}>
                    <p>{language === "es" ? "DEBE MANTENERSE" : "MUST KEEP"}</p>
                    <div className={styles.intentFacts}>
                      <span>{language === "es" ? "Salida" : "Origin"}<b>{origin || (language === "es" ? "Añadir" : "Add")}</b></span>
                      <span>{language === "es" ? "Ruta" : "Route"}<b>{stops.length ? `${stops.length} ${language === "es" ? "paradas" : "stops"}` : (language === "es" ? "Añadir" : "Add")}</b></span>
                      <span>{language === "es" ? "Fechas" : "Timing"}<b>{effectiveIntent.timing.flexibility === "fixed" ? (language === "es" ? "Fijas" : "Fixed") : (language === "es" ? "Flexible" : "Flexible")}</b></span>
                    </div>
                    {stops.length > 0 && <div className={styles.mustSeeStops}><span>{language === "es" ? "PARADAS IMPRESCINDIBLES" : "MUST-SEE STOPS"}</span><div>{stops.map((stop) => {
                      const mustSee = !effectiveIntent.hardConstraints.optionalStopIds.includes(stop.id);
                      return <button type="button" key={stop.id} className={mustSee ? styles.intentChoiceOn : ""} onClick={() => toggleOptionalStop(stop.id)}>{mustSee ? "✓ " : ""}{stop.name}{mustSee ? "" : ` · ${language === "es" ? "opcional" : "optional"}`}</button>;
                    })}</div></div>}
                    <div className={styles.intentToggle} role="group" aria-label={language === "es" ? "Flexibilidad de fechas" : "Date flexibility"}>
                      <button type="button" className={effectiveIntent.timing.flexibility === "fixed" ? styles.intentChoiceOn : ""} onClick={() => updateTimingFlexibility("fixed")}>{language === "es" ? "Fechas fijas" : "Dates fixed"}</button>
                      <button type="button" className={effectiveIntent.timing.flexibility === "flexible" ? styles.intentChoiceOn : ""} onClick={() => updateTimingFlexibility("flexible")}>{language === "es" ? "Duración flexible" : "Flexible duration"}</button>
                    </div>
                    <div className={styles.fixedCommitment}>
                      <label><span>{language === "es" ? "LUGAR DEL PLAN FIJO" : "FIXED PLAN PLACE"}</span><input value={fixedCommitmentLabel} onChange={(event) => setFixedCommitmentLabel(event.target.value)} placeholder={language === "es" ? "Ej. Oaxaca" : "e.g. Oaxaca"} /></label>
                      <MorroviaDatePicker
                        className={styles.fixedCommitmentDate}
                        mode="single"
                        size="compact"
                        locale={language}
                        label={language === "es" ? "Fecha fija" : "Fixed date"}
                        value={fixedCommitmentDate}
                        onChange={setFixedCommitmentDate}
                      />
                      <button type="button" onClick={addFixedCommitment} disabled={!fixedCommitmentLabel.trim()}><Plus />{language === "es" ? "Añadir" : "Add"}</button>
                    </div>
                  </section>
                  <section className={styles.intentPreferences}>
                    <p>{language === "es" ? "PREFERENCIAS" : "PREFERENCES"}</p>
                    <div className={styles.intentFieldRow}>
                      <MorroviaQuantitySelector
                        className={styles.intentTraveller}
                        compact
                        label={language === "es" ? "Viajeros" : "Travellers"}
                        locale={language}
                        noun={language === "es" ? "viajero" : "traveller"}
                        nounPlural={language === "es" ? "viajeros" : "travellers"}
                        value={effectiveIntent.travellers}
                        min={1}
                        max={12}
                        onChange={updateTravellers}
                      />
                      <div><span>{language === "es" ? "RITMO" : "PACE"}</span><div className={styles.intentToggle}>{(["relaxed", "balanced", "packed"] as TripIntentPace[]).map((pace) => <button type="button" key={pace} className={effectiveIntent.preferences.pace === pace ? styles.intentChoiceOn : ""} onClick={() => updateIntentPreferences({ pace })}>{language === "es" ? ({ relaxed: "Tranquilo", balanced: "Equilibrado", packed: "Intenso" }[pace]) : ({ relaxed: "Relaxed", balanced: "Balanced", packed: "Packed" }[pace])}</button>)}</div></div>
                    </div>
                    <div className={styles.intentFieldRow}>
                      <div><span>{language === "es" ? "PRESUPUESTO" : "BUDGET"}</span><div className={styles.intentToggle}>{(["value", "mid", "high"] as const).map((band) => <button type="button" key={band} className={budget === band ? styles.intentChoiceOn : ""} onClick={() => { setBudget(band); setBudgetPreference({ source: "explicit", value: band }); updateIntentPreferences({ budgetSensitivity: band }); }}>{language === "es" ? ({ value: "Ajustado", mid: "Medio", high: "Alto" }[band]) : ({ value: "Value", mid: "Mid", high: "High" }[band])}</button>)}</div></div>
                    </div>
                    <label className={styles.dislikesField}><span>{language === "es" ? "EVITAR (OPCIONAL)" : "AVOID (OPTIONAL)"}</span><input value={effectiveIntent.preferences.dislikes.join(", ")} onChange={(event) => updateIntentPreferences({ dislikes: event.target.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 6) })} placeholder={language === "es" ? "Ej. traslados nocturnos, calor extremo" : "e.g. overnight transfers, extreme heat"} /></label>
                  </section>
                </div>
                <footer className={styles.intentSummary}><span>{language === "es" ? "RESUMEN ANTES DE PLANIFICAR" : "PLAN SUMMARY"}</span><p><b>{effectiveIntent.travellers} {language === "es" ? "viajeros" : "travellers"}</b> · {effectiveIntent.timing.flexibility === "fixed" ? (language === "es" ? "fechas fijas" : "fixed dates") : (language === "es" ? `${totalDays} días flexibles` : `${totalDays} flexible days`)} · <b>{stops.map((stop) => stop.name).join(" · ") || (language === "es" ? "sin paradas aún" : "no stops yet")}</b>{effectiveIntent.hardConstraints.fixedCommitments.length ? ` · ${effectiveIntent.hardConstraints.fixedCommitments.length} ${language === "es" ? "condición fija" : "fixed commitment"}${effectiveIntent.hardConstraints.fixedCommitments.length === 1 ? "" : "s"}` : ""}</p></footer>
                </div>}
                {effectiveIntent.hardConstraints.fixedCommitments.length > 0 && (!isHomepagePromptHandoff || showTripDetails) && <div className={styles.commitmentChips}>{effectiveIntent.hardConstraints.fixedCommitments.map((item) => <span key={item.id}>{item.date ? `${item.date} · ` : ""}{item.label}<button type="button" aria-label={`${language === "es" ? "Quitar" : "Remove"} ${item.label}`} onClick={() => removeFixedCommitment(item.id)}><X /></button></span>)}</div>}
              </section>}
              </section>}

            </div>

          {hasRouteSkeleton && (
            <div id="builder-timing" tabIndex={-1} className={`${styles.stack} ${styles.timeStep}`}>
              {mountedBuilder && lastStructuralChange?.canonical ? <div className={styles.builderUndoToast}><MorroviaBriefNotice key={structuralNoticeVersion} variant="toast" autoDismissMs={6000} autoDismissWithAction onDismiss={() => setLastStructuralChange(null)} title={language === "es" ? "Viaje actualizado" : "Trip updated"}
                action={<EasyTButton variant="quiet" size="small" onClick={undoStructuralChange}>{language === "es" ? "Deshacer" : "Undo"}</EasyTButton>} /></div> : null}
              {mountedBuilder?.snapshot.draft.fields.filter(field=>field.status==="binding-conflict").map((field,index)=><MorroviaStatusBanner key={JSON.stringify(field.binding)} tone="warning"
                title={language === "es" ? "Revisa tu entrada guardada" : "Review your saved input"}
                detail={`${field.raw} — ${language === "es" ? "El viaje cambió mientras se comprobaba esta entrada. Sigue guardada en este dispositivo." : "The trip changed while this input was being checked. It remains saved on this device."}`}
                actions={<EasyTButton variant="quiet" size="small" onClick={()=>mountedBuilder.session.discardDraft(field.binding)}>{language === "es" ? "Descartar entrada" : "Discard input"}<span className="sr-only"> {index+1}</span></EasyTButton>} />)}
              <TripBuilderRouteWorkspace
                canonicalTrip={activeTripDocument}
                previewStopIds={routePreviewStopIds}
                selectedStopId={selectedRouteStopId}
                lockedStopIds={protectedBuilderStopIds}
                fixedOrder={fixedBuilderChronology}
                routeCheckProposalStopIds={optimizationProposal&&!optimizationStale?optimizationProposal.projectedTrip.stops.map(stop=>stop.id):currentRouteCheckProposalStopIds}
                legReview={legId=>necessaryReview(["leg"],legId)}
                stopReview={stopId=><>{necessaryReview(["recommendation"],stopId)}{renderSavedLocationReview(stopId)}</>}
                nightReview={nightEditFeedback?.tone==="warning" ? <p role="status" className={styles.hintError}>{nightEditFeedback.title} {nightEditFeedback.detail}</p> : null}
                reviewControl={<div className={styles.builderReviewActions}>
                  <MorroviaSaveStatus state={mountedBuilder?.snapshot.failedUnits.length ? "error" : mountedBuilder?.snapshot.pendingUnits.length ? "saving" : "saved"}
                    label={mountedBuilder?.snapshot.failedUnits.length ? (language === "es" ? "Datos sin actualizar" : "Details need retry") : mountedBuilder?.snapshot.conflictUnits.length ? (language === "es" ? "Revisión necesaria" : "Review needed") : mountedBuilder?.snapshot.pendingUnits.length ? (language === "es" ? "Actualizando datos…" : "Updating details…") : (language === "es" ? "Datos actualizados" : "Details up to date")} />
                </div>}
                nightStatus={{ total: totalNights, allocated: allocatedNights, complete: allNightsAllocated, language }}
                onSelectStop={setSelectedRouteStopId}
                onPreviewOrder={setRoutePreviewStopIds}
                onCommitOrder={commitStopOrder}
                onEditNights={updateAllocatedDays}
                onAdjustNights={adjustAllocatedDays}
                onRemoveStop={requestRemoveStop}
                onTransportChoiceChange={(legId, identity) => {
                  if (builderEditSessionRef.current) { dispatchAcceptedBuilderEdit({ kind: "transport", legId, identity }); return; }
                  const next = identity
                    ? selectTripLegTransportChoice(activeTripDocument, legId, identity)
                    : clearTripLegTransportChoice(activeTripDocument, legId);
                  setDecisionSelections(next.brief.decisionSelections ?? { transportByLeg: {} });
                }}
              />
              {false && <section className={styles.routeTimePlanner} aria-labelledby="day-allocation-title" role="table">
                <header><h3 id="day-allocation-title">{language === "es" ? "Noches por parada" : "Nights per stop"}</h3></header>
                <div className={styles.routeTimeColumns} role="row"><span role="columnheader">STOP</span><span role="columnheader">TRANSFER</span><span role="columnheader">NIGHTS</span><span role="columnheader">USABLE TIME</span></div>
                <div className={styles.routeTimeRows} role="rowgroup">
                  {stops.map((stop, index) => {
                    const days = allocation[stop.id] ?? 0;
                    const duration = routeIntelligence.durations[stop.id];
                    const leg = activeTripDocument.legs.find((candidate) => candidate.toStopId === stop.id) ?? null;
                    const arrivalLoad = canonicalArrivalLoad(leg ?? undefined);
                    const usableDays = arrivalLoad === "unknown" ? null : usableStopDays(days, arrivalLoad);
                    const compressed = Boolean(duration && (days < duration.minimumDays || (usableDays !== null && usableDays < 1)));
                    const transferMinutes = leg ? leg.doorToDoorMinutes ?? leg.durationMinutes : null;
                    const TransferIcon = leg?.mode === "flight" ? Plane : leg?.mode === "train" ? Train : leg?.mode === "ferry" ? Ship : leg?.mode === "road" ? CarFront : leg?.mode === "mixed" ? Route : AlertTriangle;
                    const includesFlight = leg?.mode === "flight" || leg?.segments?.some((segment) => segment.mode === "flight");
                    const startsAtOrigin = index === 0 && stopMatchesPlace(stop, journeyStartPlace);
                    const locked = scheduleLocks.stopIds.includes(stop.id) || Boolean(scheduleLocks.arrivalDates[stop.id]);
                    const destinationPhoto = routeDestinationPhoto(stop.name, stop.country);
                    const destinationPhotoSource = destinationPhoto?.variants.at(-1);
                    const transferOrigin = leg?.classification === "arrival"
                      ? origin
                      : activeTripDocument.stops.find((candidate) => candidate.id === leg?.fromStopId)?.name;
                    const transferIsUnknown = leg?.mode === "unknown";
                    const transferContext = transferIsUnknown
                      ? (language === "es" ? "Traslado por confirmar · Transporte por comprobar" : "Transfer to confirm · Transport needs checking")
                      : leg
                      ? `${transferOrigin ? `From ${transferOrigin} · ` : ""}${transferJourneyModeLabel(leg)}`
                      : startsAtOrigin
                        ? (language === "es" ? "Empieza aquí · Sin traslado de llegada" : "Starts here · No arrival transfer")
                        : (language === "es" ? "Traslado por confirmar · Transporte por comprobar" : "Transfer to confirm · Transport needs checking");
                    return <div key={stop.id} role="row" className={`${styles.routeTimeRow} ${dragId === stop.id ? styles.routeTimeRowDragging : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); moveStop(stops.findIndex((item) => item.id === (dragId ?? event.dataTransfer.getData("text/plain"))), index); setDragId(null); }}>
                      <StopReorderControl stop={stop} canMoveUp={!locked && canMoveStop(index, index - 1)} canMoveDown={!locked && canMoveStop(index, index + 1)} onMoveUp={() => moveStop(index, index - 1)} onMoveDown={() => moveStop(index, index + 1)} onDragStart={(event) => { setDragId(stop.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", stop.id); }} onDragEnd={() => setDragId(null)} />
                      <div className={styles.routeStopIdentity} role="cell">
                        <span className={styles.routeStopImage}>
                          <ResilientImage src={destinationPhotoSource?.src} srcSet={destinationPhoto?.variants.map((image) => `${image.src} ${image.width}w`).join(", ")} sizes="(max-width: 700px) 92px, 1px" width={destinationPhotoSource?.width ?? 92} height={destinationPhotoSource?.height ?? 92} alt="" fallback={<span className={styles.routeStopImageFallback} role="img" aria-label={`Image unavailable for ${stop.name}`}><MapPin aria-hidden="true" /></span>} />
                        </span>
                        <div className={styles.routeStopName}><b>{index + 1}</b><span><strong>{stop.name}</strong></span></div>
                      </div>
                      <div className={styles.routeTransferSummary} role="cell"><TransferIcon aria-hidden="true" /><span><strong className={styles.transferContext}>{transferContext}</strong>{leg && !transferIsUnknown && <span className={`${styles.transferDurationLine} ${styles.transferTiming}`}><small>{durationLabel(transferMinutes)}{includesFlight && transferMinutes !== null ? " total" : ""}</small>{includesFlight && transferMinutes !== null && <span className={styles.transferDurationHelp}><button type="button" aria-label={language === "es" ? "El total estimado puerta a puerta incluye el traslado al aeropuerto, facturación y seguridad, espera, vuelo, frontera o conexión cuando se conoce, y el traslado hasta tu alojamiento. Morrovia usa este total para calcular el tiempo aprovechable." : "The estimated door-to-door total includes airport access, check-in and security, departure buffer, flight time, border or connection time where known, and transfer to your stay. Morrovia uses this total to calculate usable time."}><Info aria-hidden="true" /></button><span className={styles.transferDurationTooltip} role="tooltip" aria-hidden="true">{language === "es" ? "Total estimado puerta a puerta: acceso al aeropuerto, facturación y seguridad, espera, vuelo, frontera o conexión cuando se conoce y traslado hasta tu alojamiento. Se usa para calcular el tiempo aprovechable." : "Estimated door-to-door total: airport access, check-in and security, departure buffer, flight time, border or connection time where known, and transfer to your stay. Used to calculate usable time."}</span></span>}</span>}</span></div>
                      <div className={styles.nightsControl} role="cell"><span className={styles.mobileFieldLabel}>{language === "es" ? "Noches" : "Nights"}</span><button type="button" aria-label={`Remove one night from ${stop.name}; ${days} nights currently`} disabled={days <= 0 || locked} onClick={() => adjustAllocatedDays(stop.id, -1)}>−</button><strong aria-label={`${days} nights`}>{days}</strong><button type="button" aria-label={`Add one night to ${stop.name}; ${days} nights currently`} disabled={days >= totalNights || locked} onClick={() => adjustAllocatedDays(stop.id, 1)}>+</button></div>
                      <div className={`${styles.usableTime} ${compressed ? styles.usableTimeWarning : ""}`} role="cell"><span className={styles.mobileFieldLabel}>{language === "es" ? "Tiempo útil" : "Usable time"}</span><strong>{usableDays === null ? (language === "es" ? "Por confirmar" : "To confirm") : `~${usableDays} ${usableDays === 1 ? "day" : "days"}`}</strong>{compressed && <AlertTriangle aria-label="Compressed stop" />}</div>
                    </div>;
                  })}
                  {routeJourneyEnd ? (() => {
                    const leg = activeTripDocument.legs.find((candidate) => candidate.classification === "departure" && candidate.toStopId === routeJourneyEnd!.id);
                    if (!leg) return null;
                    const transferMinutes = leg!.doorToDoorMinutes ?? leg!.durationMinutes;
                    const ReturnIcon = leg!.mode === "flight" ? Plane : leg!.mode === "train" ? Train : leg!.mode === "ferry" ? Ship : leg!.mode === "road" ? CarFront : Route;
                    return <div className={styles.routeTimeRow} role="row" key={routeJourneyEnd!.id}>
                      <span className={styles.reorderControl} aria-hidden="true" />
                      <div className={styles.routeStopIdentity} role="cell"><span className={styles.routeStopImage}><span className={styles.routeStopImageFallback} aria-hidden="true"><MapPin /></span></span><div className={styles.routeStopName}><b>↩</b><span><strong>{routeJourneyEnd!.name}</strong><small>{language === "es" ? "Final del viaje" : "Journey return"}</small></span></div></div>
                      <div className={styles.routeTransferSummary} role="cell"><ReturnIcon aria-hidden="true" /><span><strong className={styles.transferContext}>{transferJourneyModeLabel(leg!)}</strong><span className={`${styles.transferDurationLine} ${styles.transferTiming}`}><small>{durationLabel(transferMinutes)}</small></span></span></div>
                      <div className={styles.nightsControl} role="cell"><span className={styles.mobileFieldLabel}>{language === "es" ? "Noches" : "Nights"}</span><strong aria-label="Zero nights">0</strong></div>
                      <div className={styles.usableTime} role="cell"><span className={styles.mobileFieldLabel}>{language === "es" ? "Tiempo útil" : "Usable time"}</span><strong>{language === "es" ? "Solo traslado" : "Travel only"}</strong></div>
                    </div>;
                  })() : null}
                </div>
              </section>}
              {showRouteStatus && !geographyGateConflict && <section ref={timingWarningRef} tabIndex={gateConflict ? -1 : undefined} className={`${styles.timingWarning} ${gateConflict ? styles.timingWarningBlocking : highlyCompressedTrip || longJourneyIssue?.consequence.level === "strong" ? styles.timingWarningStrong : ""}`} role={gateConflict ? "alert" : "status"} aria-labelledby="timing-warning-title">
                <button type="button" className={styles.disclosureHead} aria-expanded={timingWarningOpen} aria-controls="timing-warning-content" onClick={() => setTimingWarningOpen((current) => !current)}>
                  <AlertTriangle aria-hidden="true" /><span><strong id="timing-warning-title"><span className="sr-only">{gateConflict ? (language === "es" ? "Bloqueo: " : "Blocking: ") : highlyCompressedTrip || longJourneyIssue?.consequence.level === "strong" ? (language === "es" ? "Advertencia importante: " : "Strong caution: ") : routeRecommendationVisible && !showTimingWarning ? (language === "es" ? "Sugerencia: " : "Suggestion: ") : (language === "es" ? "Aviso: " : "Caution: ")}</span>{timingWarningTitle}</strong></span><ChevronRight aria-hidden="true" />
                </button>
                {timingWarningOpen && <div id="timing-warning-content" className={styles.timingWarningContent}>
                  {gateConflict?.code !== "itinerary-stop-uncovered" && <section><strong>{language === "es" ? "Qué significa" : "What this means"}</strong><ul>
                    {highlyCompressedTrip && <><li>{language === "es" ? `${oneNightStopCount} de ${stops.length} paradas tienen una noche o menos.` : `${oneNightStopCount} of ${stops.length} stops have one night or less.`}</li>{unknownTransferCount > 0 && <li>{language === "es" ? `${unknownTransferCount === 1 ? "Un traslado" : `${unknownTransferCount} traslados`} aún necesita comprobarse, por lo que el tiempo aprovechable puede ser menor.` : `${unknownTransferCount === 1 ? "One transfer" : `${unknownTransferCount} transfers`} still ${unknownTransferCount === 1 ? "needs" : "need"} checking, so usable time may be lower.`}</li>}{longTransferCount > 0 && <li>{language === "es" ? `${longTransferCount === 1 ? "Un traslado ocupa" : `${longTransferCount} traslados ocupan`} gran parte de un día.` : `${longTransferCount === 1 ? "One transfer uses" : `${longTransferCount} transfers use`} a large part of a day.`}</li>}</>}
                    {!highlyCompressedTrip && longJourneyIssue && <><li>{language === "es" ? `Tendrás aproximadamente ${longJourneyIssue.usableDays} días aprovechables en ${longJourneyIssue.stop.name}.` : `You’ll have about ${longJourneyIssue.usableDays} usable days in ${longJourneyIssue.stop.name}.`}</li><li>{longJourneyIssue.duration.reason}</li></>}
                    {!gateConflict && !highlyCompressedTrip && !longJourneyIssue && tripTimingNotice && <li>{tripTimingNotice}</li>}
                    {!gateConflict && routeRecommendationVisible && <li>{routeRecommendationReason}</li>}
                    {!gateConflict && routeCoverageNotice && <li>{routeCoverageNotice}</li>}
                    {!gateConflict && transportReviewNotice && <li>{transportReviewNotice}</li>}
                  </ul></section>}
                  {!gateConflict && !routeRecommendationVisible && longJourneyIssue && scoredAlternativeRoutes.length > 0 ? <section><strong>{language === "es" ? "Revisar opciones" : "Review options"}</strong><div className={styles.timingAlternatives}>{scoredAlternativeRoutes.map((alternative) => <article key={alternative.candidateIndex}><div><b>{alternative.names.join(" → ")}</b><small>{alternative.usableDayGain > 0 ? `+${alternative.usableDayGain} ${language === "es" ? "días aprovechables" : "usable days"}` : `${durationLabel(alternative.transferMinuteGain)} ${language === "es" ? "menos de traslado" : "less transfer"}`}</small></div><button type="button" onClick={() => applyScoredRouteCandidate(alternative.candidateIndex, alternative.stopIds)}>{language === "es" ? "Usar" : "Use route"}</button></article>)}</div></section> : null}
                  {!gateConflict && routeRecommendationVisible ? <section><strong>{language === "es" ? "Orden recomendado" : "Recommended order"}</strong>{currentRouteCheckProposalStopIds ? <><p>{currentRouteCheckProposalStopIds.map((id) => stops.find((stop) => stop.id === id)?.name).filter(Boolean).join(" → ")}</p><div className={styles.routeStatusActions}><EasyTButton size="small" onClick={applyRouteCheckProposal}>{language === "es" ? "Aplicar orden" : "Apply order"}</EasyTButton><EasyTButton size="small" variant="secondary" onClick={() => { setRouteCheckProposalStopIds(null); setKeptRouteKey(routeKey); }}>{language === "es" ? "Mantener orden actual" : "Keep current order"}</EasyTButton></div></> : <EasyTButton size="small" variant="secondary" onClick={() => setRouteCheckProposalStopIds(routeIntelligence.route.recommendedStopIds)}>{language === "es" ? "Comparar orden" : "Compare order"}</EasyTButton>}</section> : null}
                </div>}
              </section>}
            </div>
          )}
        </div>

      </div>

      {activeClarificationMention && discoveryDraft && discoveryProjection && renderedDiscoveryEntry.kind !== "skip" && renderedDiscoveryEntry.kind !== "legacy-recovery" ? <DiscoveryModal
        open={clarificationOpen && Boolean(activeClarificationId)}
        entry={renderedDiscoveryEntry}
        mention={activeClarificationMention}
        projection={discoveryProjection}
        canonicalReview={canonicalDiscoveryReview}
        draft={discoveryDraft}
        loading={discoveryCommitting}
        saveError={saveState === "error" ? cloudSaveError : undefined}
        language={language}
        existingPlaceIds={stops.flatMap((stop) => stop.canonicalPlaceId ? [stop.canonicalPlaceId] : [])}
        onAction={(action) => {
          if (discoveryCommitRef.current) return;
          if (discoveryRead?.status === "unsupported-version") return;
          const nextDraft = reduceDiscoveryDraft(discoveryDraft, action);
          const event = discoveryChoiceEvent(discoveryEventKind, discoveryDraft, nextDraft, action, discoveryProjection.places.length);
          if (event?.name === "discovery_direction_selected") trackEvent("discovery_direction_selected", event.properties);
          else if (event?.name === "discovery_place_choice_changed") trackEvent("discovery_place_choice_changed", event.properties);
          updateDiscoveryPlanningState((current) => {
            const read = readDiscoveryDraft(current, activeClarificationMention.mentionId);
            if (read.status === "unsupported-version") return current;
            const base = read.status === "current" ? read.draft : { ...read.draft, step: discoveryEntry.step };
            return { ...current, discoveryDraftByMentionId: {
              ...current.discoveryDraftByMentionId,
              [activeClarificationMention.mentionId]: reduceDiscoveryDraft(base, action),
            } };
          });
        }}
        onConfirm={() => {
          const review = canonicalDiscoveryReview;
          if (discoveryCommitRef.current || !review?.canConfirm) return;
          discoveryCommitRef.current = true;
          setDiscoveryCommitting(true);
          const mention = activeClarificationMention;
          const checkpoint = async () => {
            const owners = discoveryOwnersRef.current;
            let recovery = owners.persistDeviceRecovery(owners.trip);
            if (!recovery.stored && receiptAcknowledgementRef.current) {
              const acknowledged = await receiptAcknowledgementRef.current;
              const current = discoveryOwnersRef.current;
              if (acknowledged && current.trip.id === owners.trip.id) {
                recovery = current.persistDeviceRecovery(current.trip);
              }
            }
            setDeviceRecoveryBlocked(recovery.blockedByExistingRecovery);
            setDeviceStorageBlocked(!recovery.stored && !recovery.blockedByExistingRecovery);
            setSaveState(recovery.stored ? "local" : "error");
            if (!recovery.stored) setCloudSaveError(language === "es"
              ? "No pudimos guardar estas elecciones. Vuelve a intentarlo antes de cerrar."
              : "These choices could not be saved. Retry before closing.");
            return recovery.stored;
          };
          void (async () => {
            try {
              // Paint the existing progress state before canonical acceptance.
              await new Promise<void>(resolve => window.requestAnimationFrame(() => window.setTimeout(resolve, 0)));
              const result = await commitDiscoveryReview(review, {
                currentTrip: () => discoveryOwnersRef.current.trip,
                addBase: async choice => {
                  const suggestion = choice.suggestion;
                  const reviewedPlace = discoveryProjection.places.find(place => place.id === choice.id);
                  const coordinates = suggestion.coordinates ?? reviewedPlace?.coordinates;
                  if (!coordinates) return false;
                  let added: ReturnType<typeof addGuidedPlanningPlace> | undefined;
                  // Projection coordinates have already passed canonical geography and
                  // reviewed-evidence validation. Builder remains the sole mutation owner.
                  flushSync(() => { added = discoveryOwnersRef.current.addGuidedPlanningPlace(mention, {
                    ...suggestion, coordinates: [...coordinates] as [number, number], regionCanonicalPlaceId: mention.canonicalPlaceId ?? "",
                    reason: discoveryDraft.searchSelections?.some(item => item.canonicalPlaceId === choice.id)
                      ? "Traveller selected this canonical place in search." : "Traveller confirmed this reviewed place.",
                    anchorMatched: false,
                  }, true); });
                  if (!await added) return false;
                  const ownerHasChoice = () => {
                    const current = discoveryOwnersRef.current.trip;
                    return current.stops.some(stop => stop.canonicalPlaceId === choice.id)
                      && Boolean(current.brief.structuredBrief?.placeSelections?.some(selection => selection.mentionId === mention.mentionId
                        && selection.selectedCanonicalPlaceId === choice.id
                        && current.stops.some(stop => stop.id === selection.routeStopId && stop.canonicalPlaceId === choice.id)));
                  };
                  // React may commit the state updates after the async Add handler
                  // resolves. Wait for the layout-effect-owned canonical document
                  // before the confirmation owner validates and checkpoints it.
                  for (let frame = 0; frame < 8 && !ownerHasChoice(); frame++) {
                    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
                  }
                  return ownerHasChoice();
                },
                linkVisit: async (visit, stopId) => {
                  flushSync(() => discoveryOwnersRef.current.confirmAttractionVisit(mention, visit.proposal, stopId));
                  const ownerHasVisit = () => discoveryOwnersRef.current.trip.brief.structuredBrief?.placeSelections?.some(selection =>
                    selection.mentionId === visit.intentId && selection.kind === "visit" && selection.routeStopId === stopId
                    && selection.provenance.id === `builder-attraction-visit:${visit.intentId}:${stopId}`) ?? false;
                  // In the full app, the canonical trip document is projected
                  // from the committed render. Let its layout-effect ref catch
                  // up before the commit owner validates the visit checkpoint.
                  for (let frame = 0; frame < 8 && !ownerHasVisit(); frame++) {
                    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
                  }
                  return ownerHasVisit();
                },
                applyRouteOrder: async orderedIds => {
                  const current = discoveryOwnersRef.current.trip;
                  const stopIds = orderedIds.map(id => id.startsWith("discovery:")
                    ? current.stops.find(stop => stop.canonicalPlaceId === id.slice("discovery:".length))?.id
                    : id).filter((id): id is string => Boolean(id));
                  if (stopIds.length !== current.stops.length || new Set(stopIds).size !== current.stops.length) return false;
                  return discoveryOwnersRef.current.applyRouteOrder(stopIds);
                },
                persist: checkpoint,
                completeMention: () => completeDiscoveryMention({
                  stage: () => flushSync(() => {
                    if(builderEditSessionRef.current)dispatchAcceptedBuilderEdit({kind:"planning-area",action:"complete",mentionId:mention.mentionId});
                    else setCompletedPlanningAreaMentionIds(current => [...new Set([...current, mention.mentionId])]);
                    updateDiscoveryPlanningState(current => ({ ...current, discoveryDraftByMentionId: {
                      ...current.discoveryDraftByMentionId, [mention.mentionId]: reduceDiscoveryDraft(discoveryDraft, { type: "mark-confirmed" }),
                    } }));
                  }),
                  persist: checkpoint,
                  rollback: () => flushSync(() => {
                    if(builderEditSessionRef.current)dispatchAcceptedBuilderEdit({kind:"planning-area",action:"reopen",mentionId:mention.mentionId});
                    else setCompletedPlanningAreaMentionIds(current => current.filter(id => id !== mention.mentionId));
                    updateDiscoveryPlanningState(current => ({ ...current, discoveryDraftByMentionId: {
                      ...current.discoveryDraftByMentionId, [mention.mentionId]: discoveryDraft,
                    } }));
                  }),
                }),
              });
              if (!result.ok) {
                const names = result.committedIds.map(id => discoveryProjection.places.find(place => place.id === id)?.name
                  ?? discoveryDraft.searchSelections?.find(item => item.canonicalPlaceId === id)?.name ?? mention.canonicalName).join(", ");
                setBaseSearchErrors(current => ({ ...current, [mention.mentionId]: language === "es"
                  ? `${names ? `Guardados: ${names}. ` : ""}Quedan elecciones sin confirmar. Vuelve a intentarlo; se conservarán las elecciones guardadas.`
                  : `${names ? `Saved: ${names}. ` : ""}Some choices still need confirmation. Retry; saved choices will be reused.` }));
                return;
              }
              setCloudSaveError("");
              const completion = discoveryConfirmedEvent(result.ok, discoveryEventKind, discoveryDraft.shortlistIds.length);
              if (completion) trackEvent("discovery_confirmed", completion);
              // Discovery has committed canonical route bases. Return to the
              // existing Builder editing surface instead of retaining its
              // compact, desktop-hidden handoff summary state.
              completePlanningArea(mention, true);
              setShowStopEditor(true);
              advanceClarificationSession();
            } finally {
              discoveryCommitRef.current = false;
              setDiscoveryCommitting(false);
            }
          })();
        }}
        onClose={(action) => {
          if (discoveryCommitRef.current) return;
          if (lastAcknowledgedCanonicalRef.current
            && tripDocumentsCanonicalEquivalent(activeTripDocument, lastAcknowledgedCanonicalRef.current)) {
            dismissClarificationSession();
            const dismissal = discoveryDismissedEvent(true, discoveryEventKind, action, discoveryDraft.shortlistIds.length);
            if (dismissal) trackEvent("discovery_dismissed", dismissal);
            return;
          }
          // Persist an explicit empty draft as well as changed choices. Sparse
          // browse-only flows may have no mutation action before Finish later.
          flushSync(() => updateDiscoveryPlanningState((current) => ({ ...current, discoveryDraftByMentionId: {
            ...current.discoveryDraftByMentionId,
            [activeClarificationMention.mentionId]: discoveryDraft,
          } })));
          const recovery = discoveryOwnersRef.current.persistDeviceRecovery(discoveryOwnersRef.current.trip);
          setDeviceRecoveryBlocked(recovery.blockedByExistingRecovery);
          setDeviceStorageBlocked(!recovery.stored && !recovery.blockedByExistingRecovery);
          setSaveState(recovery.stored ? "local" : "error");
          if (!recovery.stored) {
            setCloudSaveError(language === "es"
              ? "No pudimos guardar tus elecciones. Mantén esta ventana abierta y resuelve el problema de recuperación."
              : "Your choices could not be saved. Keep this window open and resolve the recovery issue.");
            return;
          }
          setCloudSaveError("");
          dismissClarificationSession();
          const dismissal = discoveryDismissedEvent(recovery.stored, discoveryEventKind, action, discoveryDraft.shortlistIds.length);
          if (dismissal) trackEvent("discovery_dismissed", dismissal);
        }}
        search={{
          value: baseSearchInputs[activeClarificationMention.mentionId] ?? "",
          error: baseSearchErrors[activeClarificationMention.mentionId],
          onChange: (value) => {
            setBaseSearchInputs((current) => ({ ...current, [activeClarificationMention.mentionId]: value }));
            setBaseSearchErrors((current) => ({ ...current, [activeClarificationMention.mentionId]: "" }));
            setOutsideDiscoveryChoice(null);
            setPendingDiscoveryBase(null);
          },
          onSelect: (suggestion) => {
            if (discoveryEntry.kind === "clarification") {
              if (!discoveryClarificationSearchCanAdd(suggestion)) {
                setBaseSearchErrors((current) => ({ ...current, [activeClarificationMention.mentionId]: language === "es"
                  ? `Elige una ciudad o población verificada donde alojarte para ${suggestion.name}.`
                  : `Choose a verified city or town to stay in for ${suggestion.name}.` }));
                return;
              }
              const placeResult: PlaceIntelligenceResult = {
                version: PLACE_INTELLIGENCE_VERSION,
                parserVersion: PLACE_INTELLIGENCE_PARSER_VERSION,
                sequenceKind: "unordered",
                mentions: capturedStructuredBrief.placeMentions ?? intakeMentions,
                issues: capturedStructuredBrief.placeIssues ?? [],
              };
              const selectedResult = selectPlaceSearchSuggestion(placeResult, activeClarificationMention.mentionId, suggestion);
              const selectedMention = selectedResult.mentions.find((mention) => mention.mentionId === activeClarificationMention.mentionId);
              if (!selectedMention?.canonicalPlaceId || selectedMention.status !== "resolved") {
                setBaseSearchErrors((current) => ({ ...current, [activeClarificationMention.mentionId]: language === "es"
                  ? `No pudimos confirmar ${suggestion.name} como la identidad de ${placeDisplayName(activeClarificationMention)}.`
                  : `We could not confirm ${suggestion.name} as the identity of ${placeDisplayName(activeClarificationMention)}.` }));
                return;
              }
              handoffLookupSessionRef.current?.handled.add(activeClarificationMention.mentionId);
              setHandoffResolutionStatuses((current) => retireHandoffResolutionStatus(current, activeClarificationMention.mentionId));
              setLocationChoices((current) => current.filter(({ mention }) => mention.mentionId !== activeClarificationMention.mentionId));
              const nextBrief = extractStructuredTripBrief(
                tripBrief || capturedStructuredBrief.source.rawPrompt || "",
                selectedResult.parserVersion,
                selectedResult,
              );
              if(builderEditSessionRef.current && !dispatchAcceptedBuilderEdit({kind:"planning-mention",action:"replace",mention:selectedMention,expectedMention:activeClarificationMention}))return;
              setCapturedStructuredBrief(nextBrief);
              setIntakeMentions(selectedResult.mentions);
              const selectedFixedCommitments = fixedTripCommitmentsFromStructuredBrief(nextBrief).filter((commitment) =>
                commitment.place?.canonicalPlaceId === suggestion.canonicalPlaceId
                || commitment.place?.name.toLocaleLowerCase() === suggestion.name.toLocaleLowerCase());
              // The canonical resolution command binds captured nights to its
              // exact source/stop in one accepted result. Legacy state owners
              // retain their existing projection until canonical hydration.
              if (!builderEditSessionRef.current && selectedFixedCommitments.length) {
                const current=effectiveIntent;
                const fixedCommitments = [...current.hardConstraints.fixedCommitments];
                for (const commitment of selectedFixedCommitments) {
                  const index = fixedCommitments.findIndex((existing) => existing.place?.canonicalPlaceId === suggestion.canonicalPlaceId
                    || existing.place?.name.toLocaleLowerCase() === suggestion.name.toLocaleLowerCase());
                  if (index < 0) fixedCommitments.push(commitment);
                  else fixedCommitments[index] = {
                    ...fixedCommitments[index]!,
                    place: fixedCommitments[index]!.place ?? commitment.place,
                    fixedNights: fixedCommitments[index]!.fixedNights ?? commitment.fixedNights,
                  };
                }
                setTripIntent({ ...current, hardConstraints: { ...current.hardConstraints, fixedCommitments } });
              }
              // Explicit search resolves the original phrase and retains its
              // occurrence/night constraints. It is not a new appended stop.
              void addStop(suggestion.name, suggestion.country, activeClarificationMention.mentionId, {
                kind: "ambiguity",
                selectedCanonicalPlaceId: suggestion.canonicalPlaceId,
                selectedName: suggestion.name,
                selectedPlaceType: suggestion.placeType,
                selectedParentCountries: [suggestion.country],
                provenance: selectedMention.provenance[0]!,
              }, suggestion).then((added) => {
                if (added) advanceClarificationSession();
              });
              return;
            }
            const choosingBase = discoveryEntry.kind === "landmark" || discoveryEntry.kind === "natural-area";
            if (!choosingBase) {
              if (!discoverySearchStopSuggestion(suggestion)) {
                if (placeSuggestionRequiresBaseSelection(suggestion)) {
                  setPendingDiscoveryBase({ mentionId: activeClarificationMention.mentionId, area: suggestion });
                  setBaseSearchInputs(current => ({ ...current, [activeClarificationMention.mentionId]: "" }));
                  setBaseSearchErrors(current => ({ ...current, [activeClarificationMention.mentionId]: "" }));
                  return;
                }
                setBaseSearchErrors(current => ({ ...current, [activeClarificationMention.mentionId]: language === "es"
                  ? `${suggestion.name} necesita una ciudad o población como base antes de añadirla como parada. Tus lugares elegidos siguen guardados.`
                  : `${suggestion.name} needs a city or town as a base before it can be added as a stop. Your selected places remain saved.` }));
                return;
              }
              if (discoverySearchOutsideMention(suggestion, activeClarificationMention)) {
                setOutsideDiscoveryChoice({ mentionId: activeClarificationMention.mentionId, suggestion });
                return;
              }
              addDiscoverySearchSelection(suggestion, false);
              return;
            }
            const reviewedPlace = discoveryProjection.places.find((place) => place.id === suggestion.canonicalPlaceId
              && place.country === suggestion.country);
            const suitablePlace = Boolean(reviewedPlace && (choosingBase
              ? discoveryBaseSuitableForMention(reviewedPlace, activeClarificationMention)
              : discoveryPlaceWithinMention(suggestion.canonicalPlaceId, activeClarificationMention)));
            if (!suitablePlace || !reviewedPlace
              || reviewedPlace.actionability === "browse-only"
              || (choosingBase && reviewedPlace.actionability !== "overnight-base")) {
              setBaseSearchErrors((current) => ({ ...current, [activeClarificationMention.mentionId]: language === "es"
                ? `Aún no podemos confirmar ${suggestion.name} como lugar revisado para tu viaje. Tu idea original sigue guardada; busca otro lugar o termina más tarde.`
                : `We cannot confirm ${suggestion.name} as a reviewed place for your trip yet. Your original idea is saved; search for another place or Finish later.` }));
              return;
            }
            setBaseSearchErrors((current) => ({ ...current, [activeClarificationMention.mentionId]: "" }));
            const searchChoice = choosingBase
              ? { type: "choose-visit-base" as const, intentId: activeClarificationMention.mentionId, baseId: suggestion.canonicalPlaceId }
              : { type: "add-shortlist" as const, placeId: suggestion.canonicalPlaceId };
            const searchDraft = selectCanonicalSearchResult(discoveryDraft, suggestion, discoveryProjection.places,
              choosingBase ? { type: "choose-visit-base", intentId: activeClarificationMention.mentionId } : { type: "add-shortlist" });
            const searchEvent = discoveryChoiceEvent(discoveryEventKind, discoveryDraft, searchDraft, searchChoice, discoveryProjection.places.length);
            if (searchEvent?.name === "discovery_place_choice_changed") trackEvent("discovery_place_choice_changed", searchEvent.properties);
            updateDiscoveryPlanningState((current) => {
              const read = readDiscoveryDraft(current, activeClarificationMention.mentionId);
              if (read.status === "unsupported-version") return current;
              const base = read.status === "current" ? read.draft : { ...read.draft, step: discoveryEntry.step };
              return { ...current, discoveryDraftByMentionId: { ...current.discoveryDraftByMentionId,
                [activeClarificationMention.mentionId]: selectCanonicalSearchResult(base, suggestion, discoveryProjection.places,
                  choosingBase
                    ? { type: discoveryEntry.kind === "landmark" || discoveryEntry.kind === "natural-area" ? "choose-visit-base" : "choose-base", intentId: activeClarificationMention.mentionId }
                    : { type: "add-shortlist" }) } };
            });
          },
        }}
        outsideChoice={outsideDiscoveryChoice?.mentionId === activeClarificationMention.mentionId ? {
          suggestion: outsideDiscoveryChoice.suggestion,
          onAdd: () => addDiscoverySearchSelection(outsideDiscoveryChoice.suggestion, true),
          onCancel: () => {
            setOutsideDiscoveryChoice(null);
            setBaseSearchInputs(current => ({ ...current, [activeClarificationMention.mentionId]: "" }));
          },
        } : undefined}
        baseChoice={pendingDiscoveryBase?.mentionId === activeClarificationMention.mentionId ? {
          area: pendingDiscoveryBase.area,
          candidates: searchedAreaBases?.mentionId === activeClarificationMention.mentionId ? searchedAreaBases.suggestions : [],
          status: searchedAreaBases?.mentionId === activeClarificationMention.mentionId ? searchedAreaBases.status : "loading",
          value: baseSearchInputs[activeClarificationMention.mentionId] ?? "",
          onChange: value => { setBaseSearchInputs(current => ({ ...current, [activeClarificationMention.mentionId]: value }));
            setBaseSearchErrors(current => ({ ...current, [activeClarificationMention.mentionId]: "" })); },
          onSelect: suggestion => {
            if (!discoveryBaseForSearchedArea(pendingDiscoveryBase.area, suggestion)) {
              setBaseSearchErrors(current => ({ ...current, [activeClarificationMention.mentionId]: language === "es"
                ? `No podemos confirmar ${suggestion.name} como base en ${pendingDiscoveryBase.area.name}. Busca otra ciudad o población.`
                : `We cannot confirm ${suggestion.name} as a base in ${pendingDiscoveryBase.area.name}. Search for another city or town.` }));
              return;
            }
            if (discoverySearchOutsideMention(suggestion, activeClarificationMention)) {
              setPendingDiscoveryBase(null);
              setOutsideDiscoveryChoice({ mentionId: activeClarificationMention.mentionId, suggestion });
              return;
            }
            addDiscoverySearchSelection(suggestion, false);
          },
          onCancel: () => { setPendingDiscoveryBase(null); setBaseSearchErrors(current => ({ ...current, [activeClarificationMention.mentionId]: "" })); },
        } : undefined}
      /> : renderedDiscoveryEntry.kind === "legacy-recovery" ? <BuilderClarificationDialog
        open={clarificationOpen && Boolean(activeClarificationId) && Boolean(activeProviderClarification || activeClarificationMention)}
        language={language}
        itemKey={activeClarificationId ?? "clarification"}
        progress={language === "es" ? `${clarificationIndex + 1} de ${Math.max(1, clarificationSessionIds.length)}` : builderClarificationProgress(clarificationIndex, clarificationSessionIds.length)}
        title={clarificationTitle}
        description={clarificationDescription}
        question={clarificationQuestion}
        selectedPlaces={clarificationSelectedPlaces}
        discovery={clarificationDiscovery && activeClarificationMention ? {
          candidates: clarificationDiscovery.candidates.map((candidate) => {
            const presentation = countryDiscoveryCandidatePresentation(language, candidate);
            const photo = routeDestinationPhoto(candidate.name, candidate.country);
            const src = photo?.variants.at(-1)?.src;
            const credit = src ? routeImageCredit(src) : null;
            const recommendationSource = candidate.recommendationProvenance.find((source) => source.url);
            return {
              id: candidate.placeId,
              name: candidate.name,
              country: candidate.country,
              reason: presentation.reason,
              stayGuidance: presentation.stayGuidance,
              source: recommendationSource?.url ? { label: recommendationSource.label, url: recommendationSource.url } : undefined,
              alreadyInTrip: candidate.alreadyInTrip,
              image: credit ? { src: credit.src, alt: photo?.alt ?? candidate.name, creditHref: credit.fullCreditUrl, credit: credit.sourceLabel } : undefined,
            };
          }),
          selectedIds: clarificationDiscovery.selectedIds,
          availableNights: clarificationDiscovery.availableNights,
          onToggle: (id, selected) => updateDiscoveryPlanningState((current) => ({
            ...current,
            countryDiscoveryChoices: {
              ...current.countryDiscoveryChoices,
              [activeClarificationMention.mentionId]: updateCountryDiscoveryChoice(
                current.countryDiscoveryChoices?.[activeClarificationMention.mentionId] ?? clarificationDiscovery.selectedIds,
                id,
                selected,
              ),
            },
          })),
        } : undefined}
        suggestions={clarificationSuggestions}
        suggestionsLabel={clarificationUsesNearbyBases
          ? language === "es" ? "LUGARES CERCANOS SUGERIDOS" : "SUGGESTED NEARBY PLACES"
          : clarificationDiscovery ? language === "es" ? "MÁS LUGARES SUGERIDOS" : "MORE PLACE SUGGESTIONS"
            : undefined}
        suggestionsStatus={clarificationSuggestionsStatus}
        suggestionsActionLabel={clarificationUsesNearbyBases && activeNearbyDiscovery?.status === "unavailable"
          ? language === "es" ? "Reintentar búsqueda cercana" : "Retry nearby search"
          : clarificationUsesNearbyBases && nearbySuggestions.length > 3 && !nearbyExpanded
            ? language === "es" ? "Ver más lugares cercanos" : "See more nearby places"
            : undefined}
        choices={clarificationChoices}
        routeShapes={clarificationRouteShapes}
        applyingShapeId={applyingAreaShapeId}
        search={clarificationNeedsSearch && activeClarificationMention ? {
          label: clarificationIsAmbiguity && activeClarificationMention.placeType === "unknown"
            ? language === "es" ? "Buscar un lugar" : "Search for a place"
            : clarificationUsesNearbyBases
            ? language === "es" ? "¿Tienes otro lugar en mente?" : "Have somewhere else in mind?"
            : language === "es" ? `Buscar dentro de ${clarificationParentName}` : `Search within ${clarificationParentName}`,
          value: baseSearchInputs[activeClarificationMention.mentionId] ?? "",
          placeholder: clarificationIsAmbiguity && activeClarificationMention.placeType === "unknown"
            ? language === "es" ? "Buscar una ciudad o pueblo" : "Search for a city or town"
            : clarificationUsesNearbyBases
            ? language === "es"
              ? `${activeClarificationMention.placeType === "landmark" ? "Buscar cerca de" : "Buscar alrededor de"} ${clarificationParentName}`
              : `Search ${nearbyBaseSearchPreposition({ placeType: activeClarificationMention.placeType })} ${clarificationParentName}`
            : language === "es" ? `Buscar dentro de ${clarificationParentName}` : `Search within ${clarificationParentName}`,
          contextCountries: activeClarificationMention.parentCountries,
          parentConstraint: clarificationUsesNearbyBases || (clarificationIsAmbiguity && activeClarificationMention.placeType === "unknown") ? undefined : planningParentForMention(activeClarificationMention),
          nearbyAnchor: clarificationUsesNearbyBases ? activeNearbyBaseAnchor : undefined,
          allowedPlaceTypes: [...OVERNIGHT_BASE_PLACE_TYPES],
          error: baseSearchErrors[activeClarificationMention.mentionId],
          emptyMessage: clarificationIsAmbiguity && activeClarificationMention.placeType === "unknown"
            ? language === "es" ? "No encontramos una ciudad o pueblo coincidente. Prueba otra ortografía." : "No matching city or town found. Try another spelling."
            : clarificationUsesNearbyBases
            ? language === "es" ? `No encontramos una población cercana verificada. Prueba otro nombre cerca de ${clarificationParentName}.` : `No verified nearby settlement found. Try another place near ${clarificationParentName}.`
            : language === "es" ? `No encontramos lugares coincidentes en ${clarificationParentName}. Prueba otra ortografía o lugar dentro de esta geografía.` : `No matching places found in ${clarificationParentName}. Try another spelling or place within this geography.`,
          failureMessage: clarificationIsAmbiguity && activeClarificationMention.placeType === "unknown"
            ? ui.unavailable
            : clarificationUsesNearbyBases
            ? language === "es" ? `No pudimos buscar cerca de ${clarificationParentName}. Se conserva tu intención original.` : `We couldn't search near ${clarificationParentName}. Your original intent is preserved.`
            : language === "es" ? `No pudimos buscar dentro de ${clarificationParentName}. Inténtalo de nuevo.` : `We couldn't search within ${clarificationParentName}. Try again.`,
          onChange: (value) => {
            setBaseSearchInputs((current) => ({ ...current, [activeClarificationMention.mentionId]: value }));
            setBaseSearchErrors((current) => ({ ...current, [activeClarificationMention.mentionId]: "" }));
          },
          onSelect: (suggestion) => {
            if (clarificationDiscovery) updateDiscoveryPlanningState((current) => ({ ...current,
              countryDiscoveryChoices: { ...current.countryDiscoveryChoices, [activeClarificationMention.mentionId]: clarificationDiscovery.selectedIds },
            }));
            void addStop(suggestion.name, suggestion.country, activeClarificationMention.mentionId, undefined, suggestion).then((added) => {
              if (!added || !activeProviderClarification) return;
              const mentionId = activeClarificationMention.mentionId;
              handoffLookupSessionRef.current?.handled.add(mentionId);
              handoffLookupSessionRef.current?.statuses.set(mentionId, "resolved");
              setHandoffResolutionStatuses((current) => ({ ...current, [mentionId]: "resolved" }));
              setLocationChoices((current) => current.filter((item) => item.mention.mentionId !== mentionId));
              advanceClarificationSession();
            });
          },
        } : undefined}
        doneLabel={!clarificationIsAmbiguity && activeClarificationMention
          ? clarificationIsFinal
            ? language === "es" ? "Terminar de dar forma a la ruta" : "Finish shaping route"
            : language === "es" ? `Listo con ${clarificationParentName}` : `Done with ${clarificationParentName}`
          : undefined}
        doneDisabled={discoveryCommitting || (!clarificationSelected.length && !clarificationDiscovery?.selectedIds.length)}
        doneDisabledReason={discoveryCommitting ? undefined : language === "es" ? `Elige al menos un lugar para ${clarificationParentName} antes de completarlo.` : `Choose at least one place for ${clarificationParentName} before completing it.`}
        backLabel={language === "es" ? "Atrás" : "Back"}
        finishLaterLabel={language === "es" ? "Terminar más tarde" : "Finish later"}
        removeLabel={activeClarificationMention && !isOriginMention(activeClarificationMention) && activeClarificationRemovalPlan?.ownershipKnown
          ? language === "es" ? `Quitar ${clarificationParentName} del viaje` : `Remove ${clarificationParentName} from trip`
          : undefined}
        onDismiss={dismissClarificationSession}
        onBack={clarificationIndex > 0 ? () => setClarificationIndex((current) => Math.max(0, current - 1)) : undefined}
        onDone={() => {
          if (!activeClarificationMention || (!clarificationSelected.length && !clarificationDiscovery?.selectedIds.length)) return;
          if (clarificationDiscovery?.selectedIds.length) {
            if (discoveryCommitRef.current) return;
            discoveryCommitRef.current = true;
            setDiscoveryCommitting(true);
            void (async () => {
              try {
                let committed = 0;
                for (const id of clarificationDiscovery.selectedIds) {
                  const candidate = clarificationDiscovery.candidates.find((item) => item.placeId === id);
                  if (!candidate) continue;
                  const added = await addGuidedPlanningPlace(activeClarificationMention, candidate);
                  if (!added) return;
                  committed += 1;
                }
                completePlanningArea(activeClarificationMention, committed > 0);
                advanceClarificationSession();
              } finally {
                discoveryCommitRef.current = false;
                setDiscoveryCommitting(false);
              }
            })();
            return;
          }
          if (clarificationSupportsMultiple || clarificationUsesNearbyBases) completePlanningArea(activeClarificationMention);
          advanceClarificationSession();
        }}
        onRemoveItem={activeClarificationMention && activeClarificationRemovalPlan?.ownershipKnown
          ? () => removePlanningArea(activeClarificationMention, activeClarificationRemovalPlan)
          : undefined}
        onRemoveSelected={(place) => {
          const selection = clarificationSelected.find((item) => item.selectedCanonicalPlaceId === place.id);
          if (!selection?.routeStopId) return;
          restoreClarificationResumeFocusRef.current = true;
          setClarificationDismissed(true);
          setClarificationOpen(false);
          requestRemoveStop(selection.routeStopId);
        }}
        onAddSuggestion={(suggestion) => {
          if (!activeClarificationMention) return;
          const nearby = (activeNearbyDiscovery?.suggestions ?? []).find((item) => item.canonicalPlaceId === suggestion.id);
          if (nearby) {
            void addStop(nearby.name, nearby.country, activeClarificationMention.mentionId, {
              kind: activeClarificationMention.routability === "anchor_or_poi" ? "visit" : "base",
              selectedCanonicalPlaceId: nearby.canonicalPlaceId,
              selectedName: nearby.name,
              selectedPlaceType: nearby.placeType,
              selectedParentCountries: [nearby.country],
              provenance: nearby.provenance[0]!,
              ...(activeClarificationMention.routability === "anchor_or_poi" ? { relationshipType: "visit-from-base" as const, confidence: nearby.confidence } : {}),
            }, nearby);
            return;
          }
          const modelSuggestion = clarificationModelSuggestions.find((item) => item.canonicalPlaceId === suggestion.id);
          if (modelSuggestion) {
            if (clarificationUsesNearbyBases) {
              void addStop(modelSuggestion.name, modelSuggestion.country, activeClarificationMention.mentionId, {
                kind: activeClarificationMention.routability === "anchor_or_poi" ? "visit" : "base",
                selectedCanonicalPlaceId: modelSuggestion.canonicalPlaceId,
                selectedName: modelSuggestion.name,
                selectedPlaceType: modelSuggestion.placeType,
                selectedParentCountries: [modelSuggestion.country],
                provenance: modelSuggestion.provenance[0]!,
                ...(activeClarificationMention.routability === "anchor_or_poi" ? { relationshipType: "visit-from-base" as const } : {}),
              }, {
                canonicalPlaceId: modelSuggestion.canonicalPlaceId,
                name: modelSuggestion.name,
                label: `${modelSuggestion.name}, ${modelSuggestion.country}`,
                country: modelSuggestion.country,
                placeType: modelSuggestion.placeType,
                coordinates: modelSuggestion.coordinates,
                routability: "direct_destination",
                provenance: modelSuggestion.provenance,
              });
            } else void addGuidedPlanningPlace(activeClarificationMention, modelSuggestion);
            return;
          }
          const guided = clarificationGuidedSuggestions.find((item) => item.canonicalPlaceId === suggestion.id);
          if (guided) void addGuidedPlanningPlace(activeClarificationMention, guided);
        }}
        onSuggestionsAction={clarificationUsesNearbyBases && activeClarificationMention ? () => {
          if (activeNearbyDiscovery?.status === "unavailable") {
            setNearbyBaseRetryNonce((current) => current + 1);
            return;
          }
          setExpandedNearbyBaseMentionIds((current) => [...new Set([...current, activeClarificationMention.mentionId])]);
        } : undefined}
        onChoose={(choice) => {
          if (activeProviderClarification) {
            const providerIndex = clarificationChoices.findIndex((item) => item.id === choice.id);
            const providerChoice = activeProviderClarification.choices[providerIndex];
            if (providerChoice) void chooseProviderClarification(activeProviderClarification.mention, providerChoice);
            return;
          }
          if (!activeClarificationMention) return;
          if (choice.id.startsWith("visit:") && clarificationAttractionProposal) {
            confirmAttractionVisit(activeClarificationMention, clarificationAttractionProposal);
            return;
          }
          const option = clarificationIssue?.options.find((item) => `issue:${item.canonicalPlaceId}` === choice.id);
          if (!option || !clarificationIssue) return;
          if (option.kind === "base") {
            addSupportedBase(clarificationIssue, option);
            return;
          }
          void choosePlaceIdentity(activeClarificationMention, option.canonicalPlaceId).then(() => {
            if (["city", "town", "transport_gateway"].includes(option.placeType)) advanceClarificationSession();
          });
        }}
        onApplyShape={(shape) => {
          if (!activeClarificationMention) return;
          const guided = clarificationGuidedShapes.find((item) => item.id === shape.id);
          if (guided) void applyGuidedPlanningShape(activeClarificationMention, guided);
        }}
      /> : null}

      {cloudSaveError ? <div className={styles.recoveryFeedback}><MorroviaRecoveryFeedback
        title={deviceStorageBlocked || deviceRecoveryBlocked
          ? (language === "es" ? "Los cambios solo están en esta pestaña" : "Changes are only in this tab")
          : cloudConflictTrip
            ? (language === "es" ? "Este viaje tiene versiones separadas" : "This trip has separate versions")
            : cloudAuthInterrupted
              ? (language === "es" ? "Inicia sesión para terminar de guardar" : "Sign in to finish saving")
              : (language === "es" ? "No se pudo guardar en tu cuenta" : "Couldn't save to your account")}
        detail={cloudSaveError}
        safety={deviceStorageBlocked || deviceRecoveryBlocked
          ? (language === "es" ? "Mantén esta pestaña abierta hasta que Morrovia pueda guardar una copia de recuperación." : "Keep this tab open until Morrovia can store a recovery copy.")
          : cloudConflictTrip
            ? (language === "es" ? "Tus cambios del dispositivo siguen conservados y no sustituyeron la copia de la cuenta." : "Your device edits remain preserved and did not replace the account copy.")
            : (language === "es" ? "Tus últimos cambios siguen seguros en este dispositivo." : "Your latest edits are still safe on this device.")}
        actions={<EasyTButton variant="secondary" onClick={recoverFromSaveError}>{recoveryActionLabel}</EasyTButton>}
      /></div> : null}
      {hasRouteSkeleton && <div ref={builderActionRef} className={styles.wizardFoot}>
        <div className={styles.footRight}>
          {endDateStillSuggested && <small className={styles.gate}>{language === "es" ? "Confirma las fechas arriba" : "Confirm trip dates above"}</small>}
          {gate && gateConflict?.code !== "itinerary-stop-uncovered" && <small className={styles.gate}>{gate}</small>}
          <button type="button" className={styles.primary} disabled={endDateStillSuggested || Boolean(gate) || openingTrip || Boolean(cloudConflictTrip) || (Boolean(session?.user) && saveState === "error")} aria-busy={openingTrip || undefined}
            onClick={async () => {
              if (gate || endDateStillSuggested) return;
              buildTrip();
            }}>
            {openingTrip ? (language === "es" ? "Abriendo tu ruta…" : "Opening your route…") : (language === "es" ? "Crear viaje" : "Build trip")} {!openingTrip ? "→" : ""}
          </button>
        </div>
      </div>
      }
      {mountedBuilder?<TripBuilderRouteProposal current={mountedBuilder.snapshot.trip} proposal={optimizationProposal} assessment={optimizationResult?.assessment} language={language} stale={optimizationStale} error={optimizationError} onKeep={keepOptimizationOrder} onAccept={acceptRouteOptimization}/>:null}
      <MorroviaConfirmationDialog
        open={buildAttentionReviewOpen && buildAttention.length > 0}
        eyebrow={language === "es" ? "NECESITA ATENCIÓN" : "NEEDS ATTENTION"}
        title={language === "es" ? `¿Crear este viaje antes de añadir ${buildAttentionLabel}?` : `Build this trip before adding ${buildAttentionLabel}?`}
        detail={language === "es"
          ? `${buildAttentionLabel} sigue guardado en tus preferencias, pero todavía no forma parte de la ruta confirmada.`
          : `${buildAttentionLabel} remains saved in your trip brief, but is not part of the confirmed route yet.`}
        consequences={[
          language === "es" ? "Morrovia creará el viaje solo con las paradas confirmadas actuales." : "Morrovia will build using only the currently confirmed stops.",
          language === "es" ? "Puedes volver al Builder y resolver este lugar más tarde." : "You can return to the Builder and resolve this place later.",
        ]}
        cancelLabel={language === "es" ? "Volver y corregirlo" : "Go back and fix it"}
        confirmLabel={language === "es" ? `Continuar sin añadir ${buildAttentionLabel}` : `Continue without adding ${buildAttentionLabel}`}
        onCancel={() => {
          setBuildAttentionReviewOpen(false);
          openClarificationSession(firstBuildAttention?.mentionId);
          openSummaryEditor("stops");
        }}
        onConfirm={() => {
          setBuildAttentionReviewOpen(false);
          continueBuildTrip();
        }}
      />
      <MorroviaConfirmationDialog open={Boolean(pendingTopRemoval)} title={`${language==="es"?"¿Quitar":"Remove"} ${pendingTopRemoval?.name??""} ${language==="es"?"y sus estancias?":"and its stays?"}`}
        detail={pendingTopRemoval?.stays.join(" · ")??""}
        consequences={[`${pendingTopRemoval?.nights??0} ${language==="es"?"noches quedarán sin asignar.":"nights will remain unallocated."}`,language==="es"?"El contenido asociado se conservará para revisión. Revisa las reservas afectadas.":"Associated content will be retained for review. Review affected bookings."]}
        cancelLabel={language==="es"?"Conservar destino":"Keep destination"} confirmLabel={language==="es"?"Quitar destino":"Remove destination"} onCancel={()=>setPendingTopRemoval(null)}
        onConfirm={()=>{if(pendingTopRemoval){const snapshot=builderEditSessionRef.current?.getSnapshot();if(snapshot?.inputRevision===pendingTopRemoval.revision)rememberStructuralChange("remove_destination",pendingTopRemoval.stays.length);
          if(dispatchAcceptedBuilderEdit({kind:"remove-destination",intentId:pendingTopRemoval.intentId},{expectedInputRevision:pendingTopRemoval.revision})){setRoutePreviewStopIds(null);setSelectedRouteStopId(null);setNightEditFeedback(null)}}setPendingTopRemoval(null)}}/>
      <BuilderClarificationDialog open={Boolean(savedFinishReview)} language={language} itemKey={`saved-finish:${savedFinishReview?.endKey??""}`} progress={savedFinishReview?.targetId==='end'?(language==="es"?"Final guardado":"Saved finish"):(language==="es"?"Ubicación guardada":"Saved location")}
        title={savedFinishReview?.targetId==='end'?(language==="es"?"Confirmar final guardado":"Confirm saved finish"):(language==="es"?"Confirmar ubicación":"Confirm location")}
        description={savedFinishReview?.name??""} finishLaterLabel={language==="es"?"Más tarde":"Finish later"} onDismiss={dismissSavedFinish}
        suggestionsStatus={savedFinishReview?.status==="loading"?(language==="es"?"Buscando el lugar…":"Looking up the place…"):savedFinishReview?.status==="unavailable"?(language==="es"?"No pudimos confirmar este lugar. Cierra e inténtalo de nuevo.":"We couldn't confirm this place. Close and try again."):undefined}
        choices={savedFinishReview?.choices.map((choice,index)=>({id:String(index),label:choice.name,detail:placeSuggestionLocationDetail(choice,savedFinishReview.choices)}))??[]}
        onChoose={choice=>{
          if(!savedFinishReview)return;
          const snapshot=savedFinishIsCurrent(savedFinishReview),place=savedFinishReview.choices[Number(choice.id)];
          const target=snapshot?savedTargetPlace(snapshot.trip,savedFinishReview.targetId):null;
          if(!snapshot || !target || !place){dismissSavedFinish();return}
          const role=savedFinishReview.targetId==='origin'||savedFinishReview.targetId==='end'?'endpoint':'stop';
          const accepted=acceptedGeographicPlace(target,place,role);if(!accepted)return;
          const command=savedFinishReview.targetId==='end'?{kind:'legacy-end' as const,place:accepted}:
            savedFinishReview.targetId==='origin'?{kind:'origin' as const,place:accepted}:
            builderPlaceCommand(snapshot.trip,{stopId:savedFinishReview.targetId,place:accepted});
          if(command&&dispatchAcceptedBuilderEdit(command,{expectedInputRevision:snapshot.inputRevision})){
            const intent=snapshot.trip.brief.intent.route.destinations.find(item=>item.kind==='overnight_place'
              &&item.stopIds.length===1&&item.stopIds[0]===savedFinishReview.targetId);
            if(intent){
              handoffLookupSessionRef.current?.handled.add(intent.id);
              handoffLookupSessionRef.current?.statuses.set(intent.id,'resolved');
              setHandoffResolutionStatuses(current=>({...current,[intent.id]:'resolved'}));
              setLocationChoices(current=>current.filter(item=>item.mention.mentionId!==intent.id));
            }
            dismissSavedFinish();
          }
        }}/>
      <MorroviaConfirmationDialog open={Boolean(pendingTopType)} title={language==="es"?"¿Volver al punto de salida?":"Return to the starting point?"}
        detail={`${language==="es"?"Final guardado":"Saved finish"}: ${pendingTopType?.name??""}`}
        consequences={[language==="es"?"Se reemplazará el final guardado. Las estancias existentes seguirán en la ruta.":"The saved finish will be replaced. Existing stays will remain in the route."]}
        cancelLabel={language==="es"?"Conservar final":"Keep finish"} confirmLabel={language==="es"?"Volver al inicio":"Return to start"}
        onCancel={()=>setPendingTopType(null)} onConfirm={()=>{if(pendingTopType)dispatchAcceptedBuilderEdit({kind:"type",tripType:pendingTopType.type,acceptEndpointReplacement:true},{expectedInputRevision:pendingTopType.revision});setPendingTopType(null)}}/>
      <MorroviaConfirmationDialog
        open={Boolean(pendingStopRemoval)}
        error={pendingStopRemoval?.error}
        title={pendingStopRemoval ? `${language === "es" ? "¿Quitar" : "Remove"} ${pendingStopRemoval.name} ${language === "es" ? "y su plan" : "and its plan"}?` : "Remove this stop?"}
        detail={language === "es" ? "Revisa el contenido asociado antes de quitar esta parada." : "Review the associated content before removing this stop."}
        consequences={pendingStopRemoval ? [
          `${pendingStopRemoval.nights} ${language === "es" ? "noches quedarán sin asignar" : pendingStopRemoval.nights === 1 ? "night will remain unallocated" : "nights will remain unallocated"}.`,
          ...(pendingStopRemoval.plannedDays ? [`${pendingStopRemoval.plannedDays} ${language === "es" ? "días planificados" : pendingStopRemoval.plannedDays === 1 ? "planned day" : "planned days"} ${language === "es" ? "y sus actividades se conservarán para revisión" : "and their activities will be retained for review"}.`] : []),
          ...(pendingStopRemoval.savedIdeas ? [`${pendingStopRemoval.savedIdeas} ${language === "es" ? "ideas guardadas para esta parada se conservarán para revisión" : pendingStopRemoval.savedIdeas === 1 ? "saved idea for this stop will be retained for review" : "saved ideas for this stop will be retained for review"}.`] : []),
          language === "es" ? "La ruta y los traslados posteriores se volverán a calcular." : "The route and downstream transfers will be recalculated.",
          ...(pendingStopRemoval.hasStay ? [language === "es" ? "La estancia guardada para esta parada se eliminará." : "The stay saved for this stop will be removed."] : []),
          ...(pendingStopRemoval.hasBookings ? [language === "es" ? "Revisa las reservas afectadas por el cambio de ruta." : "Review bookings affected by the route change."] : []),
        ] : []}
        cancelLabel={language === "es" ? "Conservar parada" : "Keep stop"}
        confirmLabel={pendingStopRemoval ? `${language === "es" ? "Quitar" : "Remove"} ${pendingStopRemoval.name}` : (language === "es" ? "Quitar parada" : "Remove stop")}
        onCancel={() => setPendingStopRemoval(null)}
        onConfirm={confirmStopRemoval}
      />
    </div>
  );
}
