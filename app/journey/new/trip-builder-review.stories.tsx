import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState } from "react";
import TripBuilder from "./trip-builder";
import { currentTripStorageKey } from "@/lib/easyt/storage";
import { HOME_TRIP_DRAFT_KEY, createPendingIntakeReceipt, homepageReceiptForProjection, projectHomepageInput, type HomepageInputSnapshot } from "@/lib/easyt/home-trip-handoff";
import { homepageInputStorageKey } from "@/lib/easyt/private-browser-context";
import { canonicalPlaceSuggestionFor } from "@/lib/easyt/place-intelligence";
import { routePlannerPayload } from "@/lib/easyt/public-route-handoff";
import { publicRouteDetailFor } from "@/lib/easyt/public-route";
import { extractStructuredTripBrief } from "@/lib/easyt/structured-trip-brief";
import { captureJourneyBrief } from "@/lib/easyt/journey-capture";
import { AlertTriangle, CarFront, Check, CheckCircle2, ChevronRight, MapPin, Route, TrainFront, X } from "lucide-react";
import { EasyTButton, EasyTField } from "@/components/easyt/easyt-controls";
import { TOUR_TRIP_ROUTE, tourTripFixture } from "@/components/easyt/storybook/tour-trip.fixture";
import styles from "./trip-builder.module.css";

type ReviewState = "unresolved" | "partial" | "resolved" | "inline-base" | "broad-area" | "route-shapes" | "route-shape-review" | "route-shape-applied" | "interest-guidance" | "low-knowledge" | "anchor-guidance" | "reorder" | "accepted" | "normal" | "compressed" | "unknown" | "arrival" | "road" | "rail" | "mixed" | "tour";

const bases = [
  ["Belize", "Caye Caulker"],
  ["Tikal", "Flores"],
  ["Lake Atitlán", "San Pedro La Laguna"],
] as const;

function ConfirmedBases({ count = 3 }: { count?: number }) {
  return <section className={styles.resolvedPlaces} aria-label="Confirmed stay bases">
    <header><CheckCircle2 aria-hidden="true" /><span><strong>STAY BASES CONFIRMED</strong><small>Your requested destinations remain linked to these overnight bases.</small></span></header>
    <div>{bases.slice(0, count).map(([anchor, base]) => <article key={anchor} aria-label={`${anchor}, staying in ${base}`}>
      <Check aria-hidden="true" /><p><strong>{anchor}</strong><span>staying in {base}</span></p><EasyTButton variant="quiet" size="small">Change<span className="sr-only"> {anchor}</span></EasyTButton>
    </article>)}</div>
  </section>;
}

function GeographyReview({ resolved = 0 }: { resolved?: number }) {
  const pending = bases.slice(resolved);
  return <>
    {resolved > 0 && <ConfirmedBases count={resolved} />}
    {pending.length > 0 && <section className={styles.recognizedPlaces} aria-label="Shape your route">
      <header><strong>SHAPE YOUR ROUTE</strong><span>Choose concrete route places for the broad areas we recognised.</span></header>
      <div>{pending.map(([anchor, base]) => <article key={anchor} className={styles.recognizedPlaceNeedsAction}>
        <div className={styles.recognizedPlaceIdentity}><span><b>{anchor}</b><small>Choose where to stay</small></span></div>
        <p>Choose an overnight base so Morrovia can include {anchor} in the route.</p>
        <div className={styles.placeResolutionOptions}><EasyTButton variant="secondary" size="small" icon={MapPin}>{base}</EasyTButton></div>
      </article>)}</div>
    </section>}
  </>;
}

function InlineBaseClarification() {
  return <section className={styles.placesSection} aria-label="Add stop">
    <div className={styles.placesSectionHead}><strong>Stops</strong><EasyTButton variant="secondary" size="small">+ Add stop</EasyTButton></div>
    <div className={styles.stopEditor}>
      <div className={styles.inlinePlanningClarification}>
        <div className={styles.inlinePlanningIdentity} role="status"><strong>Scotland</strong><span>Region</span><p>Where in Scotland would you like to stay?</p></div>
        <div className={styles.inlinePlanningSearch}><EasyTField label="Choose a base in Scotland" placeholder="Search cities and places in Scotland" /><EasyTButton type="button" variant="secondary" size="small">Cancel</EasyTButton></div>
      </div>
    </div>
  </section>;
}

function BroadAreaGuidance() {
  return <section className={styles.recognizedPlaces} aria-label="Shape your route">
    <header><strong>SHAPE YOUR ROUTE</strong><span>Choose concrete route places for the broad areas we recognised.</span></header>
    <div><article className={styles.recognizedPlaceNeedsAction}>
      <div className={styles.recognizedPlaceIdentity}><span><b>Thailand</b><small>Country · Choose one or more places</small></span></div>
      <p>We recognised Thailand. Add one or more places to turn that broad idea into a route.</p>
      <div className={styles.guidedAreaSuggestions} aria-label="Suggestions for Thailand"><strong>SUGGESTED PLACES</strong><div>
        {["Bangkok", "Chiang Mai", "Phuket", "Ayutthaya"].map((place) => <EasyTButton type="button" variant="secondary" icon={MapPin} key={place}><span><b>{place}</b><small>Thailand · Reviewed route choice</small></span></EasyTButton>)}
      </div></div>
      <div className={styles.guidedAreaSelected} aria-live="polite"><strong>SELECTED</strong><div><span>Bangkok<EasyTButton type="button" variant="quiet" size="small" icon={X} iconOnly>Remove Bangkok</EasyTButton></span></div></div>
      <div className={styles.baseSelector}><EasyTField label="Have somewhere else in mind?" placeholder="Search within Thailand" /><EasyTButton variant="secondary" size="small" icon={Check}>Done adding places</EasyTButton></div>
    </article></div>
  </section>;
}

function RouteShapeGuidance({ state = "initial" }: { state?: "initial" | "review" | "applied" }) {
  return <section className={styles.recognizedPlaces} aria-label="Shape your route">
    <header><strong>SHAPE YOUR ROUTE</strong><span>Choose concrete route places for the broad areas we recognised.</span></header>
    <div><article className={styles.recognizedPlaceNeedsAction}>
      <div className={styles.recognizedPlaceIdentity}><span><b>Thailand</b><small>Country · Choose one or more places</small></span></div>
      <p>We recognised Thailand. Add one or more places to turn that broad idea into a route.</p>
      {state !== "applied" && <div className={styles.guidedAreaShapes} aria-label="Ways to shape Thailand">
        <strong>WAYS YOU COULD SHAPE THIS</strong>
        <div><section className={state === "review" ? styles.guidedAreaShapeReviewing : undefined}>
          {/* morrovia-ui-audit-allow-next-line native-control -- Story mirrors the production route-shape disclosure's aria-expanded interaction. */}
          <button type="button" aria-expanded={state === "review"}><span><b>Bangkok + Chiang Mai</b><small>Food · Nature · Culture</small><em>Good match for Food + Culture.</em></span><ChevronRight aria-hidden="true" /></button>
          {state === "review" && <div className={styles.guidedAreaShapeReview}><p>Review the places before adding them. Nothing has changed yet.</p><ul><li>Bangkok<span>Thailand</span></li><li>Chiang Mai<span>Thailand</span></li></ul><div><EasyTButton size="small">Add these places</EasyTButton><EasyTButton variant="quiet" size="small">Cancel</EasyTButton></div></div>}
        </section></div>
        <EasyTButton type="button" variant="quiet" size="small" className={styles.guidedAreaMore}>See other places</EasyTButton>
      </div>}
      {state === "applied" && <div className={styles.guidedAreaSelected}><strong>SELECTED</strong><div><span>Bangkok<EasyTButton type="button" variant="quiet" size="small" icon={X} iconOnly>Remove Bangkok</EasyTButton></span><span>Chiang Mai<EasyTButton type="button" variant="quiet" size="small" icon={X} iconOnly>Remove Chiang Mai</EasyTButton></span></div><EasyTButton type="button" variant="quiet" size="small" className={styles.guidedAreaMore}>Explore another route</EasyTButton></div>}
      <div className={styles.baseSelector}><EasyTField label="Have somewhere else in mind?" placeholder="Search within Thailand" /><EasyTButton variant="secondary" size="small" icon={Check} disabled={state !== "applied"}>Done adding places</EasyTButton></div>
    </article></div>
  </section>;
}

function InterestGuidance() {
  return <section className={styles.recognizedPlaces} aria-label="Shape your route"><header><strong>SHAPE YOUR ROUTE</strong><span>Choose concrete route places for the broad areas we recognised.</span></header><div><article className={styles.recognizedPlaceNeedsAction}>
    <div className={styles.recognizedPlaceIdentity}><span><b>Panama</b><small>Country · Choose one or more places</small></span></div><p>We do not have a reviewed multi-place route shape here yet.</p>
    <div className={styles.guidedAreaQuestion}><strong>WHAT WOULD YOU LIKE MORE OF?</strong><div>{["Cities", "Beach", "Nature", "Food", "Culture", "Hiking"].map((interest) => <EasyTButton type="button" variant="secondary" size="small" key={interest}>{interest}</EasyTButton>)}</div><EasyTButton type="button" variant="quiet" size="small" className={styles.guidedAreaMore}>See places without choosing a preference</EasyTButton></div>
    <div className={styles.baseSelector}><EasyTField label="Have somewhere else in mind?" placeholder="Search within Panama" /></div>
  </article></div></section>;
}

function LowKnowledgeGuidance() {
  return <section className={styles.recognizedPlaces} aria-label="Shape your route"><header><strong>SHAPE YOUR ROUTE</strong><span>Choose concrete route places for the broad areas we recognised.</span></header><div><article className={styles.recognizedPlaceNeedsAction}>
    <div className={styles.recognizedPlaceIdentity}><span><b>Iran</b><small>Country · Choose one or more places</small></span></div><p>We recognised Iran, but do not have enough reviewed route knowledge to suggest a route shape.</p>
    <div className={styles.baseSelector}><EasyTField label="Choose a place in Iran" placeholder="Search within Iran" /></div>
  </article></div></section>;
}

function AnchorGuidance() {
  return <section className={styles.recognizedPlaces} aria-label="Shape your route"><header><strong>SHAPE YOUR ROUTE</strong><span>Choose concrete route places for the broad areas we recognised.</span></header><div><article className={styles.recognizedPlaceNeedsAction}>
    <div className={styles.recognizedPlaceIdentity}><span><b>Africa</b><small>Continent · Serengeti is shaping these ideas</small></span></div><p>We recognised Africa and kept your Serengeti request as the stronger signal.</p>
    <div className={styles.guidedAreaShapes}><strong>WAYS YOU COULD SHAPE THIS</strong><div><section>
      {/* morrovia-ui-audit-allow-next-line native-control -- Story mirrors the production route-shape disclosure's aria-expanded interaction. */}
      <button type="button" aria-expanded="false"><span><b>East Africa, wildlife with space</b><small>Nairobi + Maasai Mara + Zanzibar</small><em>Responds to your Serengeti request using reviewed route knowledge.</em></span><ChevronRight aria-hidden="true" /></button></section></div></div>
    <div className={styles.baseSelector}><EasyTField label="Have somewhere else in mind?" placeholder="Search within Africa" /></div>
  </article></div></section>;
}

function RouteReview({ accepted = false }: { accepted?: boolean }) {
  return <section className={styles.timingWarning} role="status" aria-label="Route Check result">
    <button type="button" className={styles.disclosureHead} aria-expanded="true"><Route aria-hidden="true" /><span><strong>{accepted ? "Route order accepted" : "A better route order is available"}</strong></span><ChevronRight aria-hidden="true" /></button>
    <div className={styles.timingWarningContent}>
      <section><strong>What this means</strong><ul><li>{accepted ? "This order keeps the trip moving in a sensible direction." : "It reduces unnecessary backtracking between your stops."}</li></ul></section>
      <section><strong>{accepted ? "Current order" : "Recommended order"}</strong><p>Cancún → Tulum → Caye Caulker → Flores → Antigua Guatemala → San Pedro La Laguna</p>{!accepted && <div className={styles.routeStatusActions}><EasyTButton size="small">Apply order</EasyTButton><EasyTButton size="small" variant="secondary">Keep current order</EasyTButton></div>}</section>
    </div>
  </section>;
}

function TourRouteReview() {
  return <div style={{ display: "grid", gap: 16, padding: 24 }}>
    <section className={styles.timingWarning} aria-label="Tour route review">
      <button type="button" className={styles.disclosureHead} aria-expanded="true"><Route aria-hidden="true" /><span><strong>Route order accepted</strong></span><ChevronRight aria-hidden="true" /></button>
      <div className={styles.timingWarningContent}><section><strong>What this means</strong><ul><li>Seven nights, with the longest transfer protected as a travel day.</li></ul></section><section><strong>Current order</strong><p>{TOUR_TRIP_ROUTE}</p></section></div>
    </section>
    <section className={styles.resolvedPlaces} aria-label="Confirmed stay structure">
      <header><CheckCircle2 aria-hidden="true" /><span><strong>STAY STRUCTURE CONFIRMED</strong><small>Each overnight base has enough time to support the route.</small></span></header>
      <div>{tourTripFixture.stops.map((stop) => <article key={stop.id} aria-label={`${stop.name}, ${stop.nights} nights`}><Check aria-hidden="true" /><p><strong>{stop.name}</strong><span>{stop.nights} nights</span></p></article>)}</div>
    </section>
  </div>;
}

function TimingReview({ kind }: { kind: "normal" | "compressed" | "unknown" | "arrival" | "road" | "rail" | "mixed" }) {
  const title = kind === "compressed" ? "Very fast pace"
    : kind === "unknown" ? "One major transfer still needs checking."
      : kind === "arrival" ? "The arrival journey takes most of the first day."
        : kind === "road" ? "The road connection is resolved for planning."
          : kind === "rail" ? "Rail is the sensible intercity connection."
            : kind === "mixed" ? "This journey needs a flight and a ground transfer."
          : "This trip has a comfortable amount of time in each place.";
  const summary = kind === "compressed" ? "6 stops have one night or less, and one transfer still needs checking."
    : kind === "unknown" ? "Transfer to confirm · Mode and timing still need checking."
      : kind === "arrival" ? "From London · Keep the first evening light after arrival."
        : kind === "road" ? "Huacachina → Lima · Road · ~4h 15m total."
          : kind === "rail" ? "Hiroshima → Kyoto · Rail · ~2h total."
            : kind === "mixed" ? "La Paz → Huacachina · Flight + road · ~8h 45m total."
          : "All nights are allocated, with time protected around the known transfers.";
  return <div style={{ display: "grid", gap: 12 }}>
    <header className={styles.builderRouteHeader}><div><p>ROUTE PLAN</p><h2>Your route</h2><span className={styles.builderRouteNightStatus} role="status"><CheckCircle2 aria-hidden="true" /><strong>6 total</strong><span aria-hidden="true">·</span><b>All allocated</b></span></div></header>
    <section className={`${styles.timingWarning} ${kind === "compressed" ? styles.timingWarningStrong : ""}`} role="status" aria-label={`${kind === "compressed" ? "Strong caution" : "Trip pacing"}: ${title}`}>
      <button type="button" className={styles.disclosureHead} aria-expanded={kind === "compressed"}>{kind === "road" ? <CarFront aria-hidden="true" /> : kind === "rail" ? <TrainFront aria-hidden="true" /> : kind === "mixed" ? <Route aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}<span><strong>{title}</strong></span><ChevronRight aria-hidden="true" /></button>
      {kind === "compressed" && <div className={styles.timingWarningContent}><section><strong>What this means</strong><ul><li>{summary}</li></ul></section></div>}
    </section>
  </div>;
}

function ReviewFixture({ state }: { state: ReviewState }) {
  return <main className="morrovia-editorial-page" style={{ width: "min(100%, 980px)", margin: "0 auto", padding: 16 }}>
    <section style={{ overflow: "hidden", border: "1px solid var(--morrovia-line)", borderRadius: 14, background: "#fff" }}>
      {state === "unresolved" && <GeographyReview />}
      {state === "partial" && <GeographyReview resolved={1} />}
      {state === "resolved" && <ConfirmedBases />}
      {state === "inline-base" && <InlineBaseClarification />}
      {state === "broad-area" && <BroadAreaGuidance />}
      {state === "route-shapes" && <RouteShapeGuidance />}
      {state === "route-shape-review" && <RouteShapeGuidance state="review" />}
      {state === "route-shape-applied" && <RouteShapeGuidance state="applied" />}
      {state === "interest-guidance" && <InterestGuidance />}
      {state === "low-knowledge" && <LowKnowledgeGuidance />}
      {state === "anchor-guidance" && <AnchorGuidance />}
      {state === "reorder" && <RouteReview />}
      {state === "accepted" && <RouteReview accepted />}
      {state === "tour" && <TourRouteReview />}
      {(["normal", "compressed", "unknown", "arrival", "road", "rail", "mixed"] as ReviewState[]).includes(state) && <div style={{ padding: 16 }}><TimingReview kind={state as "normal" | "compressed" | "unknown" | "arrival" | "road" | "rail" | "mixed"} /></div>}
    </section>
  </main>;
}

const meta = {
  title: "Morrovia/05 Product Patterns/Builder review",
  component: ReviewFixture,
  args: { state: "resolved" },
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof ReviewFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnresolvedClarification: Story = { args: { state: "unresolved" } };
export const PartiallyResolvedClarification: Story = { args: { state: "partial" } };
export const AllClarificationsResolved: Story = { args: { state: "resolved" } };
export const InlinePlanningAreaBaseSelection: Story = { args: { state: "inline-base" } };
export const BroadAreaMultiPlaceGuidance: Story = { args: { state: "broad-area" } };
export const CountryWithReviewedRouteShapes: Story = { args: { state: "route-shapes" } };
export const RouteShapeReviewedNotApplied: Story = { args: { state: "route-shape-review" } };
export const MultipleShapePlacesAppliedParentOpen: Story = { args: { state: "route-shape-applied" } };
export const CountryInterestLedNarrowing: Story = { args: { state: "interest-guidance" } };
export const CountryWithoutReviewedRouteShape: Story = { args: { state: "low-knowledge" } };
export const ContinentWithStrongSpecificAnchor: Story = { args: { state: "anchor-guidance" } };
export const RouteReorderSuggestion: Story = { args: { state: "reorder" } };
export const AcceptedRouteOrder: Story = { args: { state: "accepted" } };
export const TourCapture: Story = { args: { state: "tour" } };

// Mount the production document: fixtures seed only its existing handoff
// boundary, never a parallel route, capture, or persistence implementation.
function BuilderEntryFixture({ entry, language = "en", routeKey = "morocco-rail", snapshot }: { entry: "empty" | "populated" | "clarification" | "pending" | "partial" | "failed" | "repeated"; language?: "en" | "es"; routeKey?: string; snapshot?: HomepageInputSnapshot }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const previousUrl = window.location.href;
    const previousDraft = window.localStorage.getItem(HOME_TRIP_DRAFT_KEY);
    const inputKey = homepageInputStorageKey(null);
    const previousInput = window.localStorage.getItem(inputKey);
    const pointerKey = currentTripStorageKey(null);
    const previousPointer = window.localStorage.getItem(pointerKey);
    window.localStorage.removeItem(pointerKey);
    const previousLanguage = window.localStorage.getItem("easyt-language");
    window.localStorage.setItem("easyt-language", language);
    const originalFetch = window.fetch;
    window.fetch = (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
      if (url.pathname === "/api/journey-capture" && entry === "pending") return new Promise(() => {});
      if (url.pathname === "/api/journey-geocode" && url.searchParams.get("candidates") === "1" && ["partial", "failed", "repeated"].includes(entry)) {
        const place = url.searchParams.get("place") ?? "";
        if (entry === "failed" && place === "Tokyo") return Promise.resolve(Response.json({ error: "Provider unavailable" }, { status: 503 }));
        if (entry === "partial" && place === "Kyoto") return new Promise(() => {});
        const suggestion = canonicalPlaceSuggestionFor(place);
        const fixture = acceptancePlaceCoordinates[place];
        return Promise.resolve(Response.json({ candidates: suggestion ? [{ name: suggestion.name, country: suggestion.country, coordinates: fixture?.coordinates ?? suggestion.coordinates, canonicalPlaceId: suggestion.canonicalPlaceId }] : [] }));
      }
      if (url.pathname.startsWith("/api/journey-")) return Promise.resolve(Response.json({ candidates: [], places: [], result: null }));
      return originalFetch(input, init);
    };
    const url = new URL(previousUrl);
    url.searchParams.delete("step");
    url.searchParams.delete("trip");
    url.searchParams.delete("inspire");
    url.searchParams.delete("handoff");
    if (snapshot) window.localStorage.setItem(inputKey, JSON.stringify({ snapshot }));
    else window.localStorage.removeItem(inputKey);
    if (entry === "empty") {
      url.searchParams.delete("homeDraft");
      window.localStorage.removeItem(HOME_TRIP_DRAFT_KEY);
    } else if (entry === "pending") {
      const pendingSnapshot = snapshot ?? starterSnapshot("describe");
      const receipt = createPendingIntakeReceipt(pendingSnapshot, { handoffId: "storybook-pending", tripId: "storybook-trip-pending" });
      window.localStorage.setItem(inputKey, JSON.stringify({ snapshot: pendingSnapshot, receipt }));
      window.localStorage.setItem(HOME_TRIP_DRAFT_KEY, JSON.stringify({ version: 2, phase: "pending-interpretation", receipt }));
      url.searchParams.set("homeDraft", "1");
      url.searchParams.set("handoff", receipt.handoffId);
    } else if (["partial", "failed", "repeated"].includes(entry)) {
      const fixtureIdentity = snapshot ? `${entry}-${snapshot.entries.map((item) => item.selection?.canonicalPlaceId ?? item.id).join("-")}` : entry;
      const handoffId = `storybook-${fixtureIdentity}`;
      const submitted = entry === "repeated" ? snapshot ?? starterSnapshot("stops", true) : {
        ...starterSnapshot("describe"), prompt: "Tokyo and Kyoto for one week",
      };
      const captured = submitted.mode === "describe" ? captureJourneyBrief(submitted.prompt) : undefined;
      const projected = projectHomepageInput({ snapshot: submitted, capture: captured, profile: null, handoffId });
      if (!projected.ok) throw new Error("Invalid Builder story handoff");
      const receipt = homepageReceiptForProjection(submitted, projected.draft, `storybook-trip-${fixtureIdentity}`);
      window.localStorage.setItem(inputKey, JSON.stringify({ snapshot: submitted, receipt }));
      window.localStorage.setItem(HOME_TRIP_DRAFT_KEY, JSON.stringify({ ...projected.draft, homepage: { ...projected.draft.homepage!, receipt } }));
      url.searchParams.set("homeDraft", "1");
      url.searchParams.set("handoff", handoffId);
    } else {
      url.searchParams.set("homeDraft", "1");
      const brief = "Two weeks in Thailand";
      window.localStorage.setItem(HOME_TRIP_DRAFT_KEY, JSON.stringify(entry === "populated"
        ? routePlannerPayload(publicRouteDetailFor(routeKey)!.planDraft, new Date(2027, 3, 2, 12))
        : { brief, structuredBrief: extractStructuredTripBrief(brief) }));
    }
    window.history.replaceState(window.history.state, "", url);
    setReady(true);
    return () => {
      window.fetch = originalFetch;
      if (previousPointer === null) window.localStorage.removeItem(pointerKey);
      else window.localStorage.setItem(pointerKey, previousPointer);
      if (previousLanguage === null) window.localStorage.removeItem("easyt-language");
      else window.localStorage.setItem("easyt-language", previousLanguage);
      window.history.replaceState(window.history.state, "", previousUrl);
      if (previousDraft === null) window.localStorage.removeItem(HOME_TRIP_DRAFT_KEY);
      else window.localStorage.setItem(HOME_TRIP_DRAFT_KEY, previousDraft);
      if (previousInput === null) window.localStorage.removeItem(inputKey);
      else window.localStorage.setItem(inputKey, previousInput);
    };
  }, [entry, language, routeKey, snapshot]);
  return ready ? <main className="morrovia-editorial-page"><TripBuilder /></main> : null;
}

export const DirectEmptyEntry: Story = { tags: ["!autodocs"], parameters: { nextjs: { appDirectory: true } }, render: () => <BuilderEntryFixture entry="empty" /> };
export const PopulatedHandoff: Story = { tags: ["!autodocs"], parameters: { nextjs: { appDirectory: true } }, render: () => <BuilderEntryFixture entry="populated" /> };
export const BuilderClarification: Story = { tags: ["!autodocs"], parameters: { nextjs: { appDirectory: true } }, render: () => <BuilderEntryFixture entry="clarification" /> };
export const PendingDescribeInterpretation: Story = { ...DirectEmptyEntry, render: () => <BuilderEntryFixture entry="pending" /> };
export const PartialPlaceChecks: Story = { ...DirectEmptyEntry, render: () => <BuilderEntryFixture entry="partial" /> };
export const FailedPlaceCheck: Story = { ...DirectEmptyEntry, render: () => <BuilderEntryFixture entry="failed" /> };
export const RepeatedPlaceOccurrences: Story = { ...DirectEmptyEntry, render: () => <BuilderEntryFixture entry="repeated" /> };
export const DirectEmptyEntryAt1440: Story = { ...DirectEmptyEntry, globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const DirectEmptyEntryAtLaptop: Story = { ...DirectEmptyEntry, globals: { viewport: { value: "morroviaLaptop", isRotated: false } } };
export const DirectEmptyEntryAt768: Story = { ...DirectEmptyEntry, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const DirectEmptyEntryAt390: Story = { ...DirectEmptyEntry, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const PopulatedHandoffAt1440: Story = { ...PopulatedHandoff, globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const PopulatedHandoffAt1024: Story = { ...PopulatedHandoff, globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const PopulatedHandoffAt768: Story = { ...PopulatedHandoff, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const PopulatedHandoffAt430: Story = { ...PopulatedHandoff, globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const PopulatedHandoffAt390: Story = { ...PopulatedHandoff, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const PopulatedHandoffAt320: Story = { ...PopulatedHandoff, globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const BuilderClarificationAt1440: Story = { ...BuilderClarification, globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const BuilderClarificationAtLaptop: Story = { ...BuilderClarification, globals: { viewport: { value: "morroviaLaptop", isRotated: false } } };
export const BuilderClarificationAt768: Story = { ...BuilderClarification, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const BuilderClarificationAt390: Story = { ...BuilderClarification, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const NormalPacedTrip: Story = { args: { state: "normal" } };
export const HighlyCompressedTrip: Story = { args: { state: "compressed" } };
export const UnknownMajorTransfer: Story = { args: { state: "unknown" } };
export const LongArrival: Story = { args: { state: "arrival" } };
export const RoadResolvedTransfer: Story = { args: { state: "road" } };
export const RailResolvedTransfer: Story = { args: { state: "rail" } };
export const MixedResolvedTransfer: Story = { args: { state: "mixed" } };
export const RoadResolvedTransferAt320: Story = { ...RoadResolvedTransfer, globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const RoadResolvedTransferAt390: Story = { ...RoadResolvedTransfer, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const RoadResolvedTransferAt768: Story = { ...RoadResolvedTransfer, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const RoadResolvedTransferAt1024: Story = { ...RoadResolvedTransfer, globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const MixedResolvedTransferAt320: Story = { ...MixedResolvedTransfer, globals: { viewport: { value: "morrovia320", isRotated: false } } };
export const MixedResolvedTransferAt390: Story = { ...MixedResolvedTransfer, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const MixedResolvedTransferAt768: Story = { ...MixedResolvedTransfer, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const MixedResolvedTransferAt1024: Story = { ...MixedResolvedTransfer, globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const MixedResolvedTransferAt1440: Story = { ...MixedResolvedTransfer, globals: { viewport: { value: "morrovia1440", isRotated: false } } };
export const ClarificationAt390: Story = { args: { state: "partial" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const InlineBaseSelectionAt390: Story = { args: { state: "inline-base" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const BroadAreaGuidanceAt390: Story = { args: { state: "broad-area" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const RouteShapeReviewAt390: Story = { args: { state: "route-shape-review" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const CompressedWarningAt390: Story = { args: { state: "compressed" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const BuilderReviewAt768: Story = { args: { state: "resolved" }, globals: { viewport: { value: "morrovia768", isRotated: false } } };

// Production Builder variants for skim-first content and long-label acceptance.
export const SkimFirstSpanish: Story = { ...PopulatedHandoff, render: () => <BuilderEntryFixture entry="populated" language="es" /> };
export const SkimFirstLongDestinations: Story = { ...PopulatedHandoff, render: () => <BuilderEntryFixture entry="populated" routeKey="mexico-guatemala" /> };

function starterSnapshot(mode: "stops" | "describe", longStops = false): HomepageInputSnapshot {
  const names = longStops ? ["Tokyo", "San Cristóbal de las Casas", "Tokyo"] : [];
  return {
    version: 1, ownerId: null, revision: 2, mode,
    entries: names.map((name, index) => {
      const selection = canonicalPlaceSuggestionFor(name);
      if (!selection) throw new Error(`Missing story place: ${name}`);
      return { id: `occurrence-${index + 1}`, text: selection.label, selection };
    }),
    prompt: mode === "describe" ? "Two weeks in Japan, visiting Tokyo and Kyoto" : "",
    dates: { state: "selected", value: { start: "2027-04-02", end: "2027-04-16" } },
    travellers: { state: "selected", value: 2 },
    budget: { state: "selected", value: "mid" },
    interests: { state: "selected", value: ["food", "culture"] },
    origin: { state: "untouched" }, journeyEnd: { state: "cleared" },
  };
}

export const FreshStops: Story = { ...DirectEmptyEntry };
export const FreshDescribe: Story = { ...DirectEmptyEntry, render: () => <BuilderEntryFixture entry="empty" snapshot={starterSnapshot("describe")} /> };
export const RestoredRepeatedStops: Story = { ...DirectEmptyEntry, render: () => <BuilderEntryFixture entry="empty" snapshot={starterSnapshot("stops", true)} /> };
export const RestoredAfterImport: Story = { ...DirectEmptyEntry, render: () => <BuilderEntryFixture entry="empty" snapshot={starterSnapshot("describe")} /> };
export const FreshSpanish: Story = { ...DirectEmptyEntry, render: () => <BuilderEntryFixture entry="empty" language="es" /> };
export const FreshStopsAt390: Story = { ...FreshStops, globals: { viewport: { value: "morrovia390", isRotated: false } } };
export const FreshStopsAt430: Story = { ...FreshStops, globals: { viewport: { value: "morrovia430", isRotated: false } } };
export const FreshStopsAt768: Story = { ...FreshStops, globals: { viewport: { value: "morrovia768", isRotated: false } } };
export const FreshStopsAt1024: Story = { ...FreshStops, globals: { viewport: { value: "morrovia1024", isRotated: false } } };
export const FreshStopsAt1440: Story = { ...FreshStops, globals: { viewport: { value: "morrovia1440", isRotated: false } } };


const acceptancePlaceCoordinates: Record<string, { coordinates: [number, number] }> = {
  London: { coordinates: [-0.1276, 51.5072] }, Lima: { coordinates: [-77.0428, -12.0464] },
  Tokyo: { coordinates: [139.6917, 35.6895] }, Kyoto: { coordinates: [135.7681, 35.0116] }, Osaka: { coordinates: [135.5023, 34.6937] },
  Seoul: { coordinates: [126.978, 37.5665] }, Busan: { coordinates: [129.0756, 35.1796] },
  Cusco: { coordinates: [-71.9675, -13.532] }, Arequipa: { coordinates: [-71.5375, -16.409] },
};

function acceptanceRouteSnapshot(names: string[], originName: string): HomepageInputSnapshot {
  const origin = canonicalPlaceSuggestionFor(originName);
  if (!origin) throw new Error(`Missing story origin: ${originName}`);
  return {
    ...starterSnapshot("stops"),
    entries: names.map((name, index) => {
      const selection = canonicalPlaceSuggestionFor(name);
      if (!selection) throw new Error(`Missing story place: ${name}`);
      return { id: `acceptance-${index + 1}`, text: selection.label, selection: { ...selection, coordinates: acceptancePlaceCoordinates[name]?.coordinates ?? selection.coordinates } };
    }),
    origin: { state: "selected", value: { name: origin.name, country: origin.country, canonicalPlaceId: origin.canonicalPlaceId, coordinates: acceptancePlaceCoordinates[originName]?.coordinates ?? origin.coordinates } },
    journeyEnd: { state: "selected", value: { mode: "same_as_start" } },
    dates: { state: "selected", value: { start: "2027-04-02", end: "2027-04-23" } },
  };
}

export const JapanKoreaAcceptance: Story = { ...DirectEmptyEntry, render: () => <BuilderEntryFixture entry="repeated" snapshot={acceptanceRouteSnapshot(["Tokyo", "Kyoto", "Osaka", "Seoul", "Busan"], "London")} /> };
export const RepeatedPeruAcceptance: Story = { ...DirectEmptyEntry, render: () => <BuilderEntryFixture entry="repeated" snapshot={acceptanceRouteSnapshot(["Cusco", "Arequipa", "Cusco", "Arequipa"], "Lima")} /> };
