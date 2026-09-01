import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BedDouble, CalendarDays, Check, Cloud, ExternalLink, GripVertical, HardDrive, MapPin, Minus, Plus, Save } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { EasyTTrip } from "@/lib/easyt/trip";
import EasyTNavigation from "@/app/journey/easyt-navigation";
import TripShell from "./trip-shell";
import { EasyTButton } from "./easyt-controls";
import { MorroviaBriefNotice, MorroviaConfirmationDialog, MorroviaContextualDisclosure, MorroviaRecoveryFeedback, MorroviaSaveStatus, MorroviaStatusBanner, type MorroviaSaveState } from "./morrovia-feedback";
import styles from "./morrovia-feedback.stories.module.css";

const prototypeTrip: EasyTTrip = {
  schemaVersion: 1,
  id: "japan-spring-feedback-prototype",
  ownerId: "storybook-traveller",
  title: "Japan in spring",
  status: "draft",
  startDate: "2027-04-14",
  endDate: "2027-04-25",
  travellers: 2,
  currency: "GBP",
  brief: {
    origin: "London",
    mustDo: "A slower route through Tokyo, Matsumoto and Kyoto",
    pace: "slow",
    hotelChanges: "few",
    budgetBand: "mid",
    selectedPlaces: {},
    bookings: [],
    checklist: [
      { id: "insurance", label: "Review travel insurance", complete: true },
      { id: "offline", label: "Save offline maps", complete: false },
      { id: "packing", label: "Finish packing list", complete: false },
    ],
  },
  stops: [
    { id: "tokyo", order: 0, name: "Tokyo", country: "Japan", latitude: 35.6762, longitude: 139.6503, arrivalDate: "2027-04-14", departureDate: "2027-04-18", nights: 4 },
    { id: "matsumoto", order: 1, name: "Matsumoto", country: "Japan", latitude: 36.238, longitude: 137.972, arrivalDate: "2027-04-18", departureDate: "2027-04-21", nights: 3 },
    { id: "kyoto", order: 2, name: "Kyoto", country: "Japan", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2027-04-21", departureDate: "2027-04-25", nights: 4 },
  ],
  legs: [
    { id: "tokyo-matsumoto", fromStopId: "tokyo", toStopId: "matsumoto", mode: "train", distanceKm: 220, durationMinutes: 190, provider: null, routeMetadata: {} },
    { id: "matsumoto-kyoto", fromStopId: "matsumoto", toStopId: "kyoto", mode: "train", distanceKm: 310, durationMinutes: 225, provider: null, routeMetadata: {} },
  ],
  planItems: Array.from({ length: 11 }, (_, index) => ({
    id: `japan-day-${index + 1}`,
    stopId: index < 4 ? "tokyo" : index < 7 ? "matsumoto" : "kyoto",
    dayNumber: index + 1,
    date: new Date(Date.UTC(2027, 3, 14 + index)).toISOString().slice(0, 10),
    type: index === 0 ? "arrival" as const : "activity" as const,
    title: index === 0 ? "Arrive in Tokyo" : `Plan day ${index + 1}`,
    reason: "A realistic day that keeps the route coherent.",
    notes: [],
    startsAt: null,
    endsAt: null,
    bookingUrl: null,
    latitude: null,
    longitude: null,
    image: index === 0 ? "/journey/japan-route.jpg" : null,
  })),
  recommendations: [],
  createdAt: "2026-08-27T10:00:00.000Z",
  updatedAt: "2026-08-27T10:00:00.000Z",
};

function PrototypeChrome({ children, current = "prototype" }: { children: ReactNode; current?: "prototype" | "trips" }) {
  return <main className={`${styles.page} morrovia-editorial-page`}><EasyTNavigation current={current} />{children}</main>;
}

type TripSaveFlowState = "idle" | "device" | "saving" | "error" | "retrying" | "saved";

function saveStatusFor(flow: TripSaveFlowState): { state: MorroviaSaveState; label?: string } {
  if (flow === "idle") return { state: "saved", label: "Saved to your account" };
  if (flow === "device") return { state: "device" };
  if (flow === "saving") return { state: "saving" };
  if (flow === "retrying") return { state: "saving", label: "Trying account save again…" };
  if (flow === "saved") return { state: "saved" };
  return { state: "error" };
}

function TripSaveContext({ initialState = "idle" }: { initialState?: TripSaveFlowState }) {
  const [flow, setFlow] = useState<TripSaveFlowState>(initialState);
  const [kyotoNights, setKyotoNights] = useState(initialState === "idle" ? 4 : 5);
  const working = flow === "saving" || flow === "retrying";
  const status = saveStatusFor(flow);
  const makeDeviceChange = () => { setKyotoNights((current) => current + 1); setFlow("device"); };
  const attemptSave = () => { setFlow("saving"); window.setTimeout(() => setFlow("error"), 800); };
  const retry = () => { setFlow("retrying"); window.setTimeout(() => setFlow("saved"), 800); };

  return <PrototypeChrome><section className={styles.builderPage} aria-labelledby="trip-save-heading">
    <nav className={styles.builderSteps} aria-label="Trip brief progress"><span>01 <b>Places</b></span><span data-active="true">02 <b>Dates and nights</b></span></nav>
    <div className={styles.builderGrid}>
      <div className={styles.builderMain}>
        <p className={styles.eyebrow}>STEP 2 OF 2</p><h1 id="trip-save-heading">Dates and nights</h1><p className={styles.intro}>Keep the route realistic without losing the shape of your trip.</p>
        <div className={styles.editorList} aria-live="polite" aria-atomic="true">
          <article className={styles.editorCard}><div><strong>Tokyo</strong><span>14–18 April · 4 nights</span></div><GripVertical aria-hidden="true" /></article>
          <article className={styles.editorCard}><div><strong>Matsumoto</strong><span>18–21 April · 3 nights</span></div><GripVertical aria-hidden="true" /></article>
          <article className={styles.editorCard} data-changed={kyotoNights !== 4 || undefined}><div><strong>Kyoto</strong><span>21–{21 + kyotoNights} April · {kyotoNights} nights</span></div><EasyTButton icon={Plus} iconOnly variant="secondary" aria-label="Add one night to Kyoto" onClick={makeDeviceChange}>Add one night</EasyTButton></article>
        </div>
      </div>
      <aside className={styles.tripSummary} aria-label="Trip summary"><p className={styles.eyebrow}>YOUR TRIP</p><h2>Tokyo to Kyoto</h2><strong><CalendarDays aria-hidden="true" />{7 + kyotoNights} nights</strong><strong><MapPin aria-hidden="true" />3 stops</strong><strong>{flow === "saved" || flow === "idle" ? <Cloud aria-hidden="true" /> : <HardDrive aria-hidden="true" />}{flow === "saved" || flow === "idle" ? "Account trip" : "Device copy safe"}</strong></aside>
    </div>
    {flow === "error" ? <div className={styles.builderRecovery}><MorroviaRecoveryFeedback title="Couldn't save your changes" detail="The account copy was not updated." safety="Your edits are still safe on this device." onRetry={retry} /></div> : null}
    <footer className={styles.builderFooter}>
      <MorroviaSaveStatus state={status.state} label={status.label} />
      {flow === "idle" ? <span className={styles.footerHint}>Change a night to begin the save flow.</span> : flow === "error" ? null : <EasyTButton icon={Save} size="large" loading={working} disabled={flow === "saved"} onClick={attemptSave}>{flow === "device" ? "Save to account" : flow === "saved" ? "Saved" : flow === "retrying" ? "Trying again…" : "Saving…"}</EasyTButton>}
    </footer>
  </section></PrototypeChrome>;
}

function NightsContext() {
  const [nights, setNights] = useState(4);
  return <PrototypeChrome><section className={styles.focusPage}><p className={styles.eyebrow}>DATES AND NIGHTS</p><h1>Keep each stop comfortable.</h1><p className={styles.intro}>The changed allocation is the confirmation. The quiet label only explains where the edit is safe.</p>
    <article className={styles.nightsCard} aria-live="polite" aria-atomic="true"><div><span>STOP 03</span><h2>Kyoto</h2><p>21–{21 + nights} April</p></div><div className={styles.nightControl}><EasyTButton icon={Minus} iconOnly variant="secondary" aria-label="Remove one night from Kyoto" onClick={() => setNights((current) => Math.max(1, current - 1))}>Remove one night</EasyTButton><strong>{nights}<small>{nights === 1 ? "night" : "nights"}</small></strong><EasyTButton icon={Plus} iconOnly variant="secondary" aria-label="Add one night to Kyoto" onClick={() => setNights((current) => current + 1)}>Add one night</EasyTButton></div><MorroviaSaveStatus state="device" /></article>
  </section></PrototypeChrome>;
}

function BriefNoticeContext() {
  const [visible, setVisible] = useState(true);
  return <PrototypeChrome current="trips"><section className={styles.dashboardPage}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>YOUR TRAVEL WORKSPACE</p><h1>Trips<span>.</span></h1></div>{!visible ? <EasyTButton variant="secondary" onClick={() => setVisible(true)}>Show duplicate result</EasyTButton> : null}</div><div className={styles.tripGrid}><article className={styles.prototypeTripCard} id="trip-copy"><div className={styles.prototypeTripMeta}><span>ACTIVE</span><time dateTime="2027-04-14">14 APR – 25 APR 2027</time></div><h2>Japan in spring copy</h2><p>Tokyo → Matsumoto → Kyoto</p><img src="/journey/peru-sacred-valley-route.jpg" alt="" /><ul aria-label="Trip readiness summary"><li><Check aria-hidden="true" /><span><strong>ITINERARY</strong><small>11 of 12 days planned</small></span></li><li><span aria-hidden="true">•</span><span><strong>STAYS</strong><small>0 of 3 stays sorted</small></span></li></ul><EasyTButton>Open copy</EasyTButton></article></div>{visible ? <div className={styles.noticePlacement}><MorroviaBriefNotice title="Trip duplicated" detail="“Japan in spring copy” is ready." action={<a href="#trip-copy">View copy</a>} onDismiss={() => setVisible(false)} /></div> : null}</section></PrototypeChrome>;
}

function AutoDismissNoticeContext() {
  const [visible, setVisible] = useState(true);
  return <PrototypeChrome current="trips"><section className={styles.dashboardPage}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>RESTORED TRIP</p><h1>Back in your trips.</h1><p className={styles.intro}>This harmless notice may leave after six seconds. Hovering or focusing it pauses the timer.</p></div>{!visible ? <EasyTButton variant="secondary" onClick={() => setVisible(true)}>Show restored notice</EasyTButton> : null}</div>{visible ? <div className={styles.noticePlacement}><MorroviaBriefNotice title="Trip restored" detail="“Japan in spring” is back in Active trips." autoDismissMs={6000} onDismiss={() => setVisible(false)} /></div> : null}</section></PrototypeChrome>;
}

function PersistentRecoveryContext() {
  const [state, setState] = useState<"error" | "retrying" | "saved">("error");
  const retry = () => { setState("retrying"); window.setTimeout(() => setState("saved"), 750); };
  return <main className={`${styles.page} morrovia-editorial-page`}><TripShell trip={prototypeTrip} cacheTrip={false}><section className={styles.workspace}><p className={styles.eyebrow}>ROUTE CHANGE</p><h2>Tokyo to Kyoto</h2><p className={styles.intro}>Keep the route visible while the failed change is resolved.</p><div className={styles.routeSummary}><strong>Tokyo</strong><i /><strong>Matsumoto</strong><i /><strong>Kyoto</strong></div>{state === "error" ? <MorroviaRecoveryFeedback title="Couldn't update this route" detail="The new stop order did not reach your account." safety="Your previous account route and this device edit are both safe." onRetry={retry} retryLabel="Try route update again" /> : <MorroviaSaveStatus state={state === "retrying" ? "saving" : "saved"} label={state === "retrying" ? "Trying route update again…" : "Route updated in your account"} />}</section></TripShell></main>;
}

function StatusBannerContext() {
  return <PrototypeChrome current="trips"><section className={styles.workspace} aria-labelledby="status-banner-title">
    <p className={styles.eyebrow}>PERSISTENT PRODUCT FEEDBACK</p>
    <h2 id="status-banner-title">One pattern for account and recovery truth.</h2>
    <p className={styles.intro}>Persistent state stays in the page flow. Tone communicates urgency; the copy continues to explain what is safe.</p>
    <div style={{ display: "grid", gap: 12 }}>
      <MorroviaStatusBanner title="Saved on this device" detail="Keep this trip and continue planning on another device." actions={<EasyTButton size="small">Save this trip</EasyTButton>} />
      <MorroviaStatusBanner tone="success" title="Trip saved to your account" detail="You can continue this same trip on another device." />
      <MorroviaStatusBanner tone="warning" title="Device edits kept safe" detail="You’re viewing the cloud copy. Unsynced edits remain separate until you choose what to do." actions={<><EasyTButton size="small" variant="secondary">Open device copy</EasyTButton><EasyTButton size="small" variant="danger">Discard device copy</EasyTButton></>} />
      <MorroviaStatusBanner tone="danger" title="Your session ended" detail="This trip remains visible and unchanged. Sign in before editing or syncing it." actions={<EasyTButton size="small">Sign in again</EasyTButton>} />
    </div>
  </section></PrototypeChrome>;
}

function ContextualDisclosureContext() {
  const [open, setOpen] = useState(true);
  return <PrototypeChrome><section className={styles.workspace} aria-labelledby="contextual-disclosure-title">
    <p className={styles.eyebrow}>CONTEXTUAL TRANSPARENCY</p>
    <h2 id="contextual-disclosure-title">Explain a detail where it matters.</h2>
    <p className={styles.intro}>The disclosure stays anchored to its quiet trigger without adding a permanent paragraph to the primary task.</p>
    <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 180 }}>
      <MorroviaContextualDisclosure
        open={open}
        onOpenChange={setOpen}
        title="AI-assisted planning"
        detail="Morrovia may use Luna, our AI travel assistant, to help interpret your trip brief. AI can make mistakes, so review your resulting plan before relying on important travel details."
        linkHref="/journey/privacy#ai-and-speech"
        linkLabel="Privacy details"
        triggerLabel="AI-assisted"
      />
    </div>
  </section></PrototypeChrome>;
}

function CloudConflictContext() {
  const [choice, setChoice] = useState<"none" | "cloud" | "device">("none");
  return <main className={`${styles.page} morrovia-editorial-page`}><TripShell trip={prototypeTrip} cacheTrip={false}><section className={styles.workspace}><p className={styles.eyebrow}>SAVE CONFLICT</p><h2>Choose which copy to review.</h2><p className={styles.intro}>Morrovia does not silently overwrite either version.</p>{choice === "none" ? <MorroviaRecoveryFeedback title="This trip changed on another device" detail="The account copy and this device copy now differ." safety="Both copies are safe. Open one to compare before deciding what to keep." actions={<><EasyTButton variant="secondary" onClick={() => setChoice("cloud")}>Open account copy</EasyTButton><EasyTButton onClick={() => setChoice("device")}>Open device copy</EasyTButton></>} /> : <div className={styles.copyChoice} role="status"><Check aria-hidden="true" /><div><strong>{choice === "cloud" ? "Account copy opened" : "Device copy opened"}</strong><span>The other copy remains preserved while you review this one.</span></div><EasyTButton variant="secondary" onClick={() => setChoice("none")}>Back to both copies</EasyTButton></div>}</section></TripShell></main>;
}

function RemoveStopContext({ startOpen = true }: { startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [removed, setRemoved] = useState(false);
  return <main className={`${styles.page} morrovia-editorial-page`}><TripShell trip={prototypeTrip} cacheTrip={false}><section className={styles.workspace}><p className={styles.eyebrow}>YOUR ROUTE</p><h2>Tokyo to Kyoto</h2><p className={styles.intro}>{removed ? "2 stops · 8 nights · 1 transfer" : "3 stops · 11 nights · 2 transfers"}</p><div className={styles.routeStops} aria-live="polite"><article><span>1</span><div><strong>Tokyo</strong><small>4 nights</small></div></article>{!removed ? <article><span>2</span><div><strong>Matsumoto</strong><small>3 nights · 3 planned days</small></div><EasyTButton variant="danger" onClick={() => setOpen(true)}>Remove stop</EasyTButton></article> : null}<article><span>{removed ? "2" : "3"}</span><div><strong>Kyoto</strong><small>4 nights</small></div></article></div><MorroviaConfirmationDialog open={open} title="Remove Matsumoto and its plan?" detail="This stop has downstream work that cannot be restored after the trip is saved." consequences={["3 nights and 3 itinerary days will be removed.", "Tokyo to Kyoto will become one direct route leg.", "Saved stays and notes in Matsumoto will be removed."]} cancelLabel="Keep stop" confirmLabel="Remove Matsumoto" onCancel={() => setOpen(false)} onConfirm={() => { setRemoved(true); setOpen(false); }} /></section></TripShell></main>;
}

function AffiliateBoundaryContext() {
  const [providerOpened, setProviderOpened] = useState(false);
  return <main className={`${styles.page} morrovia-editorial-page`}><TripShell trip={prototypeTrip} cacheTrip={false}><section className={styles.workspace}><p className={styles.eyebrow}>ACCOMMODATION</p><h2>Keep the provider boundary honest.</h2><p className={styles.intro}>Opening a booking site is useful, but it does not prove that a stay was booked or paid for.</p><article className={styles.stayCard} aria-live="polite"><span className={styles.stayIcon}><BedDouble aria-hidden="true" /></span><div><span>KYOTO · 21–25 APRIL</span><h3>Kyoto stay</h3><p>No saved accommodation yet</p></div><strong>Needs a stay</strong><div className={styles.stayActions}><EasyTButton icon={ExternalLink} variant="secondary" onClick={() => setProviderOpened(true)}>Open Trip.com</EasyTButton></div>{providerOpened ? <p className={styles.providerOpened} role="status"><ExternalLink aria-hidden="true" />Trip.com opened. This stop still needs a stay.</p> : null}</article><p className={styles.partnerDisclosure}>Partner link · Morrovia may earn a commission at no extra cost to you.</p></section></TripShell></main>;
}

const meta = { title: "Morrovia/03 Status & Feedback/Confirmation and recovery", parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/journey/new" } } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const TripSaveInteractive: Story = { render: () => <TripSaveContext /> };
export const TripSaveSaving: Story = { render: () => <TripSaveContext initialState="saving" /> };
export const ReducedMotionSaving: Story = { render: () => <div className={styles.forceReducedMotion}><TripSaveContext initialState="saving" /></div> };
export const TripSaveSavedToAccount: Story = { render: () => <TripSaveContext initialState="saved" /> };
export const TripSaveFailedDeviceSafe: Story = { render: () => <TripSaveContext initialState="error" /> };
export const NightsChangedInline: Story = { render: () => <NightsContext /> };
export const BriefTripDuplicatedNotice: Story = { render: () => <BriefNoticeContext /> };
export const HarmlessAutoDismissNotice: Story = { render: () => <AutoDismissNoticeContext /> };
export const PersistentRouteRecovery: Story = { render: () => <PersistentRecoveryContext /> };
export const PersistentStatusBanners: Story = { render: () => <StatusBannerContext /> };
export const ContextualTransparencyDisclosure: Story = { render: () => <ContextualDisclosureContext /> };
export const CloudConflictChoice: Story = { render: () => <CloudConflictContext /> };
export const ConsequentialStopRemoval: Story = { render: () => <RemoveStopContext /> };
export const AffiliateBoundary: Story = { render: () => <AffiliateBoundaryContext /> };
export const Mobile320SaveFailure: Story = { globals: { viewport: { value: "morrovia320", isRotated: false } }, render: () => <TripSaveContext initialState="error" /> };
export const Mobile390Dialog: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } }, render: () => <RemoveStopContext /> };
export const Mobile390StatusBanners: Story = { globals: { viewport: { value: "morrovia390", isRotated: false } }, render: () => <StatusBannerContext /> };
export const Tablet768AffiliateBoundary: Story = { globals: { viewport: { value: "morrovia768", isRotated: false } }, render: () => <AffiliateBoundaryContext /> };
export const DialogFocusAndRestore: Story = { render: () => <RemoveStopContext startOpen={false} /> };
