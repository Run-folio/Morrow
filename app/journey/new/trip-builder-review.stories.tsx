import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AlertTriangle, Check, CheckCircle2, ChevronRight, MapPin } from "lucide-react";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import styles from "./trip-builder.module.css";

type ReviewState = "unresolved" | "partial" | "resolved" | "reorder" | "accepted" | "normal" | "compressed" | "unknown" | "arrival";

const bases = [
  ["Belize", "Caye Caulker"],
  ["Tikal", "Flores"],
  ["Lake Atitlán", "San Pedro La Laguna"],
] as const;

function ConfirmedBases({ count = 3 }: { count?: number }) {
  return <section className={styles.resolvedPlaces} aria-label="Confirmed stay bases">
    <header><CheckCircle2 aria-hidden="true" /><span><strong>STAY BASES CONFIRMED</strong><small>Your requested destinations remain linked to these overnight bases.</small></span></header>
    <div>{bases.slice(0, count).map(([anchor, base]) => <article key={anchor} aria-label={`${anchor}, staying in ${base}`}>
      <Check aria-hidden="true" /><p><strong>{anchor}</strong><span>staying in {base}</span></p><button type="button">Change<span className="sr-only"> {anchor}</span></button>
    </article>)}</div>
  </section>;
}

function GeographyReview({ resolved = 0 }: { resolved?: number }) {
  const pending = bases.slice(resolved);
  return <>
    {resolved > 0 && <ConfirmedBases count={resolved} />}
    {pending.length > 0 && <section className={styles.recognizedPlaces} aria-label="Geography to review">
      <header><strong>GEOGRAPHY TO REVIEW</strong><span>Only places needing a decision appear here.</span></header>
      <div>{pending.map(([anchor, base]) => <article key={anchor} className={styles.recognizedPlaceNeedsAction}>
        <div className={styles.recognizedPlaceIdentity}><span><b>{anchor}</b><small>Choose where to stay</small></span></div>
        <p>Choose an overnight base so Morrovia can include {anchor} in the route.</p>
        <div className={styles.placeResolutionOptions}><button type="button"><MapPin aria-hidden="true" />{base}</button></div>
      </article>)}</div>
    </section>}
  </>;
}

function RouteReview({ accepted = false }: { accepted?: boolean }) {
  return <section className={styles.routeCheck} aria-live="polite">
    <div><p>ROUTE CHECK</p>{accepted
      ? <><h3>This order keeps the trip moving in a sensible direction.</h3><span>Cancún → Tulum → Caye Caulker → Flores → Antigua Guatemala → San Pedro La Laguna</span></>
      : <><h3>A cleaner order is available.</h3><span>Cancún → Tulum → Caye Caulker → Flores → Antigua Guatemala → San Pedro La Laguna</span><span className={styles.routeCheckReason}>It reduces unnecessary backtracking between your stops.</span></>}
    </div>
    {!accepted && <div className={styles.routeCheckActions}><EasyTButton size="small">Use this order</EasyTButton><EasyTButton size="small" variant="secondary">Keep my order</EasyTButton></div>}
  </section>;
}

function TimingReview({ kind }: { kind: "normal" | "compressed" | "unknown" | "arrival" }) {
  const title = kind === "compressed" ? "6 stops in 7 days is very fast-paced."
    : kind === "unknown" ? "One major transfer still needs checking."
      : kind === "arrival" ? "The arrival journey takes most of the first day."
        : "This trip has a comfortable amount of time in each place.";
  const summary = kind === "compressed" ? "6 stops have one night or less, and one transfer still needs checking."
    : kind === "unknown" ? "Transfer to confirm · Mode and timing still need checking."
      : kind === "arrival" ? "From London · Keep the first evening light after arrival."
        : "All nights are allocated, with time protected around the known transfers.";
  return <div style={{ display: "grid", gap: 12 }}>
    <div className={styles.timeAllocationState}><span className={styles.allocationLabel}>NIGHTS ALLOCATED</span><p><CheckCircle2 aria-hidden="true" /><strong>6 nights total</strong><span aria-hidden="true">•</span><b>All nights allocated</b></p></div>
    <section className={`${styles.timingWarning} ${kind === "compressed" ? styles.timingWarningStrong : ""}`} role="status" aria-label={`${kind === "compressed" ? "Strong caution" : "Trip pacing"}: ${title}`}>
      <button type="button" className={styles.disclosureHead} aria-expanded="false"><AlertTriangle aria-hidden="true" /><span><strong>{title}</strong><small>{summary}</small></span><ChevronRight aria-hidden="true" /></button>
    </section>
  </div>;
}

function ReviewFixture({ state }: { state: ReviewState }) {
  return <main className="morrovia-editorial-page" style={{ width: "min(100%, 980px)", margin: "0 auto", padding: 16 }}>
    <section style={{ overflow: "hidden", border: "1px solid var(--morrovia-line)", borderRadius: 14, background: "#fff" }}>
      {state === "unresolved" && <GeographyReview />}
      {state === "partial" && <GeographyReview resolved={1} />}
      {state === "resolved" && <ConfirmedBases />}
      {state === "reorder" && <RouteReview />}
      {state === "accepted" && <RouteReview accepted />}
      {(["normal", "compressed", "unknown", "arrival"] as ReviewState[]).includes(state) && <div style={{ padding: 16 }}><TimingReview kind={state as "normal" | "compressed" | "unknown" | "arrival"} /></div>}
    </section>
  </main>;
}

const meta = {
  title: "Builder/Clarification and route review",
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
export const RouteReorderSuggestion: Story = { args: { state: "reorder" } };
export const AcceptedRouteOrder: Story = { args: { state: "accepted" } };
export const NormalPacedTrip: Story = { args: { state: "normal" } };
export const HighlyCompressedTrip: Story = { args: { state: "compressed" } };
export const UnknownMajorTransfer: Story = { args: { state: "unknown" } };
export const LongArrival: Story = { args: { state: "arrival" } };
export const ClarificationAt390: Story = { args: { state: "partial" }, parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const CompressedWarningAt390: Story = { args: { state: "compressed" }, parameters: { viewport: { defaultViewport: "morrovia390" } } };
export const BuilderReviewAt768: Story = { args: { state: "resolved" }, parameters: { viewport: { defaultViewport: "morrovia768" } } };
