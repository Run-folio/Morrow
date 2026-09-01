import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BedDouble, CalendarDays, MapPin, Plus, UsersRound } from "lucide-react";
import { useState } from "react";
import type { JourneyLeg, JourneyStop } from "@/lib/journey";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import EasyTNavigation from "@/app/journey/easyt-navigation";
import { EasyTButton } from "./easyt-controls";
import { MorroviaRecoveryFeedback, MorroviaSaveStatus, type MorroviaSaveState } from "./morrovia-feedback";
import TripShell from "./trip-shell";
import {
  MorroviaMapLoading,
  MorroviaPlanningProgress,
  MorroviaSectionStatus,
  MorroviaSkeleton,
  type MorroviaLoadingStage,
} from "./morrovia-loading-states";
import journeyStyles from "@/app/journey/journey.module.css";
import styles from "./morrovia-loading-states.stories.module.css";

const tripPrompt = "Two weeks through Japan, relaxed pace, with Tokyo, the Japanese Alps and Kyoto. We care about food and mountain walks.";

const prototypeTrip: EasyTTrip = {
  schemaVersion: 1,
  id: "loading-prototype",
  ownerId: null,
  title: "Tokyo, Matsumoto & Kyoto",
  status: "draft",
  startDate: "2027-04-14",
  endDate: "2027-04-25",
  travellers: 2,
  currency: "GBP",
  brief: { origin: "Tokyo", mustDo: "Mountain walks and local food", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} },
  stops: [
    { id: "tokyo", order: 0, name: "Tokyo", country: "Japan", latitude: 35.6895, longitude: 139.6917, arrivalDate: "2027-04-14", departureDate: "2027-04-18", nights: 4 },
    { id: "matsumoto", order: 1, name: "Matsumoto", country: "Japan", latitude: 36.238, longitude: 137.972, arrivalDate: "2027-04-18", departureDate: "2027-04-21", nights: 3 },
    { id: "kyoto", order: 2, name: "Kyoto", country: "Japan", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2027-04-21", departureDate: "2027-04-25", nights: 4 },
  ],
  legs: [
    { id: "tokyo-matsumoto", fromStopId: "tokyo", toStopId: "matsumoto", mode: "train", distanceKm: 220, durationMinutes: 160, provider: null, routeMetadata: {} },
    { id: "matsumoto-kyoto", fromStopId: "matsumoto", toStopId: "kyoto", mode: "train", distanceKm: 310, durationMinutes: 190, provider: null, routeMetadata: {} },
  ],
  planItems: [{ id: "tokyo-arrival", stopId: "tokyo", dayNumber: 1, date: "2027-04-14", type: "arrival", title: "Arrive in Tokyo", reason: "A protected arrival day.", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null, image: "/journey/japan-evening-route.jpg" }],
  recommendations: [],
  createdAt: "2026-08-27T12:00:00.000Z",
  updatedAt: "2026-08-27T12:00:00.000Z",
};

function PrototypeChrome({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return <main className={`${styles.page} ${compact ? styles.compactPage : ""}`}>
    <EasyTNavigation current="prototype" />
    {children}
  </main>;
}

const firstStage: MorroviaLoadingStage[] = [
  { label: "Understanding your trip", state: "current" },
  { label: "Checking your places", state: "next" },
];

const secondStage: MorroviaLoadingStage[] = [
  { label: "Understanding your trip", state: "complete" },
  { label: "Checking your places", state: "current" },
];

const completedStages: MorroviaLoadingStage[] = [
  { label: "Understanding your trip", state: "complete" },
  { label: "Checking your places", state: "complete" },
];

function HomepagePlanningContext({ initialState = "loading" }: { initialState?: "loading" | "long" | "error" | "success" }) {
  const [state, setState] = useState(initialState);
  const long = state === "long";
  const complete = state === "success";
  return <PrototypeChrome>
    <section className={styles.homeContext}>
      <div className={styles.homeCopy}>
        <p>FOR THE TRIPS WITH MORE MOVING PARTS</p>
        <h1>Complex trips,<br />made simple.</h1>
        <span>Your trip idea stays visible while Morrovia works through it.</span>
      </div>
      <img src="/journey/illustrations/southeast-asia-route-hero-v3.png" alt="Watercolour route illustration through Southeast Asia" />
      <div className={styles.planningPlacement}>
        <MorroviaPlanningProgress
          prompt={tripPrompt}
          stages={complete ? completedStages : long ? secondStage : firstStage}
          state={state}
          title={state === "error" ? "We couldn’t understand that trip yet." : complete ? "Your trip brief is ready" : long ? "Checking the places you named" : "Understanding your trip"}
          detail={state === "error" ? "Your words are still here. Try again, or adjust the trip idea first." : complete ? "Tokyo, Matsumoto and Kyoto are ready for you to review in Builder." : long ? "This is taking longer than usual. Your trip idea is safe, and you can keep it exactly as written." : "Pulling out the places, timing and preferences you gave us."}
          onRetry={() => setState("loading")}
          retryLabel="Try trip again"
        />
      </div>
    </section>
  </PrototypeChrome>;
}

const pendingActions = [
  ["Plan my trip", "Understanding your trip…"],
  ["Continue", "Checking your places…"],
  ["Build trip", "Opening your route…"],
  ["Save changes", "Saving changes…"],
  ["Retry", "Trying again…"],
] as const;

function ActionPendingContext() {
  return <PrototypeChrome compact>
    <section className={styles.actionPage} aria-labelledby="action-pending-title">
      <header>
        <p>ACTION PENDING</p>
        <h1 id="action-pending-title">A quiet, immediate acknowledgement</h1>
        <span>The action stays in place, names the work underway and cannot be submitted twice.</span>
      </header>
      <div className={styles.actionTable} role="table" aria-label="Ready and pending action examples">
        <div className={styles.actionHead} role="row"><span role="columnheader">Action</span><span role="columnheader">Ready</span><span role="columnheader">Pending</span></div>
        {pendingActions.map(([ready, pending]) => <div className={styles.actionRow} role="row" key={ready}>
          <strong role="rowheader">{ready}</strong>
          <span role="cell"><EasyTButton className={styles.actionButton} variant={ready === "Retry" ? "secondary" : "primary"}>{ready}</EasyTButton></span>
          <span role="cell"><EasyTButton className={styles.actionButton} variant={ready === "Retry" ? "secondary" : "primary"} loading>{pending}</EasyTButton></span>
        </div>)}
      </div>
      <p className="sr-only" role="status">Pending controls are disabled to prevent duplicate actions.</p>
    </section>
  </PrototypeChrome>;
}

function BuilderActionContext() {
  return <PrototypeChrome>
    <section className={styles.builderContext}>
      <nav aria-label="Trip brief progress"><span>01 <b>Places</b></span><span data-active="true">02 <b>Dates and nights</b></span></nav>
      <div className={styles.builderGrid}>
        <div>
          <p>STEP 2 OF 2</p><h1>Dates and nights</h1><span>Keep the route realistic without losing the shape of your trip.</span>
          <section className={styles.builderCard}><div><strong>Tokyo</strong><span>14–18 April · 4 nights</span></div><EasyTButton variant="secondary" size="small">Edit nights</EasyTButton></section>
          <section className={styles.builderCard}><div><strong>Matsumoto and Kyoto</strong><span>7 nights across 2 stops</span></div><EasyTButton icon={Plus} variant="secondary" size="small">Adjust route</EasyTButton></section>
        </div>
        <aside><p>YOUR TRIP</p><h2>Your trip at a glance</h2><strong><CalendarDays />14 days</strong><strong><MapPin />3 stops</strong><strong><UsersRound />2 travellers</strong></aside>
      </div>
      <footer className={styles.builderFooter}><span>Changes saved on this device</span><EasyTButton loading size="large">Opening your route…</EasyTButton></footer>
    </section>
  </PrototypeChrome>;
}

function TripCardSkeleton() {
  return <article className={styles.tripSkeletonCard}>
    <div className={styles.tripSkeletonBody}>
      <div className={styles.tripSkeletonMeta}><MorroviaSkeleton height={21} width={58} radius="control" /><MorroviaSkeleton height={10} width={132} radius="round" /></div>
      <div className={styles.tripSkeletonTitle}><MorroviaSkeleton height={25} width="88%" /><MorroviaSkeleton height={25} width="64%" /></div>
      <MorroviaSkeleton height={12} width="78%" radius="round" />
      <MorroviaSkeleton className={styles.tripImageSkeleton} height={108} radius="card" />
      <div className={styles.tripSkeletonReadiness}><MorroviaSkeleton height={46} /><MorroviaSkeleton height={46} /><MorroviaSkeleton height={46} /></div>
      <div className={styles.tripSkeletonActions}><MorroviaSkeleton height={46} /><MorroviaSkeleton height={46} /><MorroviaSkeleton height={46} width={48} /></div>
    </div>
  </article>;
}

function TripsSkeletonContext() {
  return <PrototypeChrome compact>
    <section className={styles.tripsContext} aria-busy="true" aria-labelledby="trips-loading-title">
      <p>YOUR TRAVEL WORKSPACE</p><h1 id="trips-loading-title">Trips<span>.</span></h1><div className="sr-only" role="status">Loading your trips</div>
      <div className={styles.tripToolbar}><MorroviaSkeleton height={40} width={220} /><MorroviaSkeleton height={40} width={166} /></div>
      <div className={styles.tripSkeletonGrid}><TripCardSkeleton /><TripCardSkeleton /><TripCardSkeleton /></div>
    </section>
  </PrototypeChrome>;
}

function ItinerarySkeletonContext() {
  return <PrototypeChrome compact>
    <TripShell trip={prototypeTrip} cacheTrip={false}>
      <section className={styles.itinerarySkeleton} aria-busy="true" aria-labelledby="itinerary-loading-title">
        <div className="sr-only" role="status">Loading the itinerary for Tokyo, Matsumoto and Kyoto</div>
        <header><p>DAY BY DAY</p><h2 id="itinerary-loading-title">Your itinerary</h2><span>The trip shell and route identity stay available while this view opens.</span></header>
        <div className={styles.itinerarySkeletonGrid}>
          <div className={styles.itineraryDays}>
            <div className={styles.dayTabs}>{[1, 2, 3, 4].map((day) => <MorroviaSkeleton key={day} height={46} radius="control" />)}</div>
            {[1, 2].map((day) => <article key={day} className={styles.daySkeletonCard}>
              <MorroviaSkeleton height={12} width={86} radius="round" />
              <MorroviaSkeleton height={31} width={day === 1 ? "72%" : "58%"} />
              <MorroviaSkeleton height={13} width="94%" radius="round" />
              <MorroviaSkeleton height={13} width="78%" radius="round" />
            </article>)}
          </div>
          <aside className={styles.summarySkeleton} aria-label="Trip summary loading">
            <MorroviaSkeleton height={11} width={92} radius="round" />
            <MorroviaSkeleton height={30} width="76%" />
            <MorroviaSkeleton height={70} radius="card" />
            <MorroviaSkeleton height={70} radius="card" />
          </aside>
        </div>
      </section>
    </TripShell>
  </PrototypeChrome>;
}

function ProviderContext({ initial = "loading" }: { initial?: "loading" | "long" | "error" }) {
  const [state, setState] = useState(initial);
  return <PrototypeChrome compact>
    <section className={styles.providerPage}>
      <header><p>STAY IN KYOTO</p><h1>Choose where the route settles</h1><span>3 nights · 2 travellers · 14–17 April</span></header>
      <div className={styles.providerGrid}>
        <article className={styles.providerSummary}><BedDouble /><p>NEAR YOUR ROUTE</p><h2>Kyoto</h2><span>Keep the rest of the trip usable while stay options refresh.</span><EasyTButton variant="secondary">View on map</EasyTButton></article>
        <section className={styles.providerResults} aria-label="Stay options">
          <MorroviaSectionStatus
            state={state}
            title={state === "error" ? "Stay options are unavailable" : state === "long" ? "Still checking stay options" : "Checking stay options"}
            detail={state === "error" ? "The rest of your trip is unchanged. Try this provider again when you’re ready." : state === "long" ? "This provider is taking longer than usual. You can keep planning the route." : "Looking for options that fit your dates and selected stop."}
            onRetry={() => setState("loading")}
          />
          <div className={`${styles.providerSkeletons} ${state === "error" ? styles.providerSkeletonsFailed : ""}`} aria-hidden="true"><MorroviaSkeleton height={118} radius="card" /><MorroviaSkeleton height={118} radius="card" /></div>
        </section>
      </div>
    </section>
  </PrototypeChrome>;
}

function TransitionContext() {
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const copy = state === "success"
    ? { title: "Route updated", detail: "Kyoto now has 4 nights. The rest of your trip is unchanged." }
    : state === "error"
      ? { title: "The route could not be updated", detail: "Your previous route and the edit on this device are both safe." }
      : { title: "Updating the route", detail: "Keeping your stops in place while transfer estimates refresh." };
  return <PrototypeChrome compact>
    <section className={styles.transitionPage} aria-labelledby="transition-title">
      <header><p>STATE TRANSITION</p><h1 id="transition-title">One place, three clear outcomes</h1><span>The geometry stays steady as waiting resolves into confirmation or recovery.</span></header>
      <MorroviaSectionStatus state={state} title={copy.title} detail={copy.detail} onRetry={() => setState("loading")} retryLabel="Try route update again" />
      <div className={styles.transitionControls} aria-label="Prototype outcome controls">
        <EasyTButton variant="secondary" onClick={() => setState("loading")}>Show loading</EasyTButton>
        <EasyTButton variant="secondary" onClick={() => setState("success")}>Show success</EasyTButton>
        <EasyTButton variant="secondary" onClick={() => setState("error")}>Show failure</EasyTButton>
      </div>
    </section>
  </PrototypeChrome>;
}

function SaveTransitionContext() {
  const [state, setState] = useState<MorroviaSaveState>("device");
  const saving = state === "saving";
  return <PrototypeChrome compact>
    <section className={styles.savePage} aria-labelledby="save-transition-title">
      <header><p>SAVE TRANSITION</p><h1 id="save-transition-title">Keep the edit visible while its account copy catches up</h1><span>A device recovery write is acknowledged separately from the canonical account save.</span></header>
      <article className={styles.saveWorkspace}>
        <div><p>KYOTO · 21–25 APRIL</p><h2>Kyoto</h2><span>4 nights · relaxed pace</span></div>
        <EasyTButton variant="secondary">Edit nights</EasyTButton>
        <div className={styles.saveRow}>
          <MorroviaSaveStatus state={state} />
          <EasyTButton loading={saving} onClick={() => setState("saving")}>Save to account</EasyTButton>
        </div>
        {state === "error" ? <div className={styles.saveRecovery}><MorroviaRecoveryFeedback title="Couldn't save your changes" detail="The account copy was not updated." safety="Your edits are still safe on this device." retryLabel="Try saving again" onRetry={() => setState("saving")} /></div> : null}
      </article>
      <div className={styles.transitionControls} aria-label="Prototype save outcome controls">
        <EasyTButton variant="secondary" onClick={() => setState("device")}>Show device-safe state</EasyTButton>
        <EasyTButton variant="secondary" onClick={() => setState("saved")}>Complete account save</EasyTButton>
        <EasyTButton variant="secondary" onClick={() => setState("error")}>Show save failure</EasyTButton>
      </div>
    </section>
  </PrototypeChrome>;
}

const mapStops: JourneyStop[] = [
  { id: "tokyo", city: "Tokyo", country: "Japan", date: "14–18 Apr", coordinates: [139.6917, 35.6895], theme: "city", marker: "runner", description: "", highlights: [], aiPrompt: "" },
  { id: "matsumoto", city: "Matsumoto", country: "Japan", date: "18–21 Apr", coordinates: [137.972, 36.238], theme: "mountain", marker: "castle", description: "", highlights: [], aiPrompt: "" },
  { id: "kyoto", city: "Kyoto", country: "Japan", date: "21–25 Apr", coordinates: [135.7681, 35.0116], theme: "city", marker: "temple", description: "", highlights: [], aiPrompt: "" },
];

const mapLegs: JourneyLeg[] = [
  { from: "tokyo", to: "matsumoto", mode: "rail", label: "Tokyo → Matsumoto", detail: "Limited express", duration: "2h 40m" },
  { from: "matsumoto", to: "kyoto", mode: "rail", label: "Matsumoto → Kyoto", detail: "Rail via Nagoya", duration: "3h 10m" },
];

function MapContext({ state = "initial" }: { state?: "initial" | "fitting" | "recalculating" | "place" | "local" | "long" | "error" }) {
  const [mapState, setMapState] = useState(state);
  return <PrototypeChrome compact>
    <section className={styles.mapPage}>
      <header><div><p>YOUR ROUTE</p><h1>Tokyo to Kyoto</h1><span>3 stops · 11 nights · 2 train transfers</span></div><EasyTButton variant="secondary">Trip overview</EasyTButton></header>
      <MorroviaMapLoading state={mapState} onRetry={() => setMapState("initial")}>
        <div className={`${journeyStyles.journey} ${styles.mapDemo}`}>
          <JourneyPlannerMap
            stops={mapStops}
            legs={mapLegs}
            selectedId=""
            plannerPins={[]}
            focusCoordinates={null}
            draftPinCoordinates={null}
            pinPlacementMode={false}
            overviewMode
            onMapPinDrop={() => undefined}
            onPlannerPinSelect={() => undefined}
            onSelect={() => undefined}
          />
          <aside className={styles.routeContext}><p>ROUTE CONTEXT</p><strong>Tokyo → Matsumoto → Kyoto</strong><span>Route order stays visible while the map updates.</span></aside>
        </div>
      </MorroviaMapLoading>
    </section>
  </PrototypeChrome>;
}

const meta = {
  title: "Morrovia/03 Status & Feedback/Loading and progress",
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/journey/home" } },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const HomepagePlanning: Story = { render: () => <HomepagePlanningContext /> };
export const HomepageLongWait: Story = { render: () => <HomepagePlanningContext initialState="long" /> };
export const HomepageFailureRetry: Story = { render: () => <HomepagePlanningContext initialState="error" /> };
export const HomepageReady: Story = { render: () => <HomepagePlanningContext initialState="success" /> };
export const ActionPending: Story = { render: () => <ActionPendingContext /> };
export const BuilderActionPending: Story = { render: () => <BuilderActionContext /> };
export const TripsDashboardSkeleton: Story = { render: () => <TripsSkeletonContext /> };
export const TripsDashboardSkeletonMobile320: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } }, render: () => <TripsSkeletonContext /> };
export const ItineraryAndSummarySkeleton: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/journey/loading-prototype/itinerary" } } },
  render: () => <ItinerarySkeletonContext />,
};
export const LocalProviderLoading: Story = { render: () => <ProviderContext /> };
export const LocalProviderLongWait: Story = { render: () => <ProviderContext initial="long" /> };
export const LocalProviderFailureRetry: Story = { render: () => <ProviderContext initial="error" /> };
export const MapInitialLoading: Story = { render: () => <MapContext /> };
export const MapRouteBecomingAvailable: Story = { render: () => <MapContext state="fitting" /> };
export const MapRecalculation: Story = { render: () => <MapContext state="recalculating" /> };
export const MapSelectedDestinationLoading: Story = { render: () => <MapContext state="place" /> };
export const MapLocalPlacesLoading: Story = { render: () => <MapContext state="local" /> };
export const MapLongWait: Story = { render: () => <MapContext state="long" /> };
export const MapFailureRetry: Story = { render: () => <MapContext state="error" /> };
export const LoadingSuccessErrorTransitions: Story = { render: () => <TransitionContext /> };
export const SaveToAccountTransitions: Story = { render: () => <SaveTransitionContext /> };
export const ReducedMotionEquivalent: Story = {
  decorators: [(Story) => <div className={styles.forceReducedMotion}><Story /></div>],
  render: () => <HomepagePlanningContext initialState="long" />,
};
export const Mobile390Planning: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } }, render: () => <HomepagePlanningContext /> };
export const Tablet768Map: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } }, render: () => <MapContext state="recalculating" /> };
