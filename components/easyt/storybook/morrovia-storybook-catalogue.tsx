"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  BedDouble,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Ellipsis,
  Map,
  MapPin,
  Plus,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Stamp,
  TrainFront,
  Utensils,
} from "lucide-react";

import accountStyles from "@/app/journey/account.module.css";
import builderStyles from "@/app/journey/new/trip-builder.module.css";
import homeStyles from "@/app/journey/home/home.module.css";
import routeStyles from "@/app/journey/routes/[slug]/route-overview.module.css";
import itineraryStyles from "@/components/easyt/trip-itinerary-workspace.module.css";
import overviewStyles from "@/components/easyt/trip-overview-workspace.module.css";
import shellStyles from "@/components/easyt/trip-shell.module.css";
import { EasyTButton, EasyTField, EasyTSelect, EasyTTextArea } from "@/components/easyt/easyt-controls";
import { MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import { JourneyTripQuality } from "@/components/journey-trip-quality";

import inventory from "./morrovia-visual-inventory.generated.json";
import { canonicalUiOwners, visualAuditRecords, visualAuditSummary, type VisualAuditClassification, type VisualAuditRecord } from "./morrovia-visual-system-audit";
import styles from "./morrovia-storybook-catalogue.module.css";

type InventoryRecord = { value: string; count: number; examples: string[] };

const colourSemantics: Record<string, string> = {
  "--morrovia-ink": "Brand and navigation ink",
  "--morrovia-ink-soft": "Secondary product text",
  "--morrovia-action": "Primary action",
  "--morrovia-action-hover": "Action hover",
  "--morrovia-signal": "Signal and emphasis",
  "--morrovia-paper": "Page surface",
  "--morrovia-lilac": "Secondary surface",
  "--morrovia-lilac-strong": "Stronger secondary surface",
  "--morrovia-line": "Border and divider",
  "--morrovia-muted": "Muted content",
  "--morrovia-overlay": "Overlay scrim",
  "--morrovia-focus-ring": "Focus halo",
  "--morrovia-danger": "Danger and error",
  "--morrovia-danger-soft": "Danger surface",
  "--morrovia-success": "Success",
  "--morrovia-tint": "Soft signal surface",
  "--morrovia-warning": "Warning",
  "--morrovia-warning-soft": "Warning surface",
  "--morrovia-disabled": "Disabled surface",
};

const colourTokens = inventory.canonicalTokens.filter((token) => colourSemantics[token.name]);

const typeRoles = [
  ["Display", styles.displayXl, "Complex trips, made simple.", "var(--morrovia-display)", "58px", "600", ".96", "-.055em", "Editorial hero; exact scale remains page-owned"],
  ["Page heading", styles.pageHeading, "A route you can trust.", "var(--morrovia-display)", "44px", "600", "1", "-.045em", "Page or workflow identity; exact scale remains page-owned"],
  ["Section heading", styles.sectionHeading, "Plan smart, travel better", "var(--morrovia-display)", "28px", "600", "1.05", "-.035em", "Major content group; exact scale remains page-owned"],
  ["Body", styles.body, "Turn a complex multi-stop idea into a journey that feels realistic and easy to change.", "var(--morrovia-ui)", "16px", "400", "1.55", "normal", "Primary prose and explanatory content"],
  ["Supporting body", styles.supportingBody, "Keep one open pocket around the arrival transfer so the first day stays comfortable.", "var(--morrovia-ui)", "14px", "400", "1.5", "normal", "Secondary explanation that users still need to read"],
  ["Control", styles.controlLabel, "Review trip health", "var(--morrovia-ui)", "13px", "700", "1", "normal", "Compact interactive label; canonical controls own implementation"],
  ["Metadata", styles.metadata, "29 AUG 2026 · 11 DAYS · 3 STOPS", "var(--morrovia-meta)", "11px", "700", "1.35", ".08em", "Dates, counts, statuses and compact facts"],
  ["Eyebrow", styles.specimenEyebrow, "YOUR NEXT STEP", "var(--morrovia-meta)", "10px", "800", "1.2", ".12em", "Short uppercase section orientation only"],
  ["Fine print / provenance", styles.finePrint, "Editorial route reviewed 29 August 2026 · Sources and confidence remain available.", "var(--morrovia-ui)", "12px", "400", "1.45", "normal", "Legal, source and provenance copy; subordinate but readable"],
] as const;

function Catalogue({ children }: { children: ReactNode }) {
  return <main className={styles.catalogue}>{children}</main>;
}

function Intro({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <header className={styles.intro}><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1><p>{detail}</p></header>;
}

function Section({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return <section className={styles.section}><header><h2>{title}</h2><p>{detail}</p></header>{children}</section>;
}

function InventoryList({ records, visual }: { records: InventoryRecord[]; visual?: "spacing" | "radius" | "shadow" }) {
  return <div className={styles.inventoryList}>{records.map((record) => {
    const number = Number.parseFloat(record.value);
    const sampleStyle = visual === "spacing"
      ? { "--sample-size": `${Math.min(Math.max(number * 3, 6), 260)}px` } as CSSProperties
      : visual === "radius"
        ? { "--sample-radius": record.value } as CSSProperties
        : visual === "shadow"
          ? { boxShadow: record.value }
          : undefined;
    return <article className={styles.inventoryRow} key={record.value}>
      <strong>{record.value}</strong>
      <span>{record.examples.join(" · ")}</span>
      <b>{record.count}</b>
      {visual === "spacing" ? <span className={styles.spacingBar} style={sampleStyle} aria-hidden="true" /> : null}
      {visual === "radius" ? <span className={styles.radiusSample} style={sampleStyle} aria-hidden="true" /> : null}
      {visual === "shadow" ? <span className={styles.shadowSample} style={sampleStyle} aria-hidden="true" /> : null}
    </article>;
  })}</div>;
}

function AuditLeaderList({ records }: { records: Array<{ path: string; count: number }> }) {
  return <div className={styles.leaderList}>{records.map((record) => <article key={record.path}><code>{record.path}</code><b>{record.count}</b></article>)}</div>;
}

export function TypographyFoundation() {
  return <Catalogue>
    <Intro eyebrow="01 Foundations" title="Typography" detail="Morrovia has three canonical font families and six named recurring copy roles. Display and heading scale remains page-owned; meaningful sentences use body or supporting body rather than metadata styling." />
    <div className={styles.grid}>{typeRoles.map(([label, className, copy, family, size, weight, lineHeight, tracking, usage]) => <article className={styles.typeSpecimen} key={label}>
      <p className={className}>{copy}</p>
      <dl><div><dt>Role</dt><dd>{label}</dd></div><div><dt>Family</dt><dd>{family}</dd></div><div><dt>Size</dt><dd>{size}</dd></div><div><dt>Weight</dt><dd>{weight}</dd></div><div><dt>Line height</dt><dd>{lineHeight}</dd></div><div><dt>Tracking</dt><dd>{tracking}</dd></div><div><dt>Colour</dt><dd>--morrovia-ink</dd></div><div><dt>Use</dt><dd>{usage}</dd></div></dl>
    </article>)}</div>
    <ProductionTypographyComparison />
  </Catalogue>;
}

export function ProductionTypographyComparison() {
  return <Section title="Production usage comparison" detail="These specimens use the production CSS module selectors directly so small differences remain visible instead of being normalised in Storybook.">
    <div className={styles.productionTypeGrid}>
      <article className={`${styles.productionTypeSample} ${styles.homeType} ${homeStyles.hero}`}><small>Homepage · .hero h1</small><h1>Complex trips, made simple.</h1></article>
      <article className={`${styles.productionTypeSample} ${styles.builderType} ${builderStyles.stepHero}`}><small>Builder · .stepHero h2</small><h2>Where do you want to go?</h2></article>
      <article className={`${styles.productionTypeSample} ${styles.tripType} ${shellStyles.tripIdentity}`}><small>TripShell · .tripIdentity h1</small><h1>Kuala Lumpur, Penang &amp; Singapore</h1></article>
      <article className={`${styles.productionTypeSample} ${styles.overviewType} ${overviewStyles.sectionHeading}`}><small>Overview · .sectionHeading h2</small><h2>Planning progress</h2></article>
      <article className={`${styles.productionTypeSample} ${styles.itineraryType} ${itineraryStyles.dayHeader}`}><small>Itinerary · .dayHeader h2</small><h2>Rome</h2></article>
      <article className={`${styles.productionTypeSample} ${styles.routeType} ${routeStyles.heroCopy}`}><small>Route detail · .heroCopy h1</small><h1>Andean Highlands</h1></article>
      <article className={`${styles.productionTypeSample} ${styles.accountType} ${accountStyles.profileWrap}`}><small>Profile · .profileWrap &gt; h1</small><h1>Your profile.</h1></article>
    </div>
  </Section>;
}

export function ColourFoundation() {
  return <Catalogue>
    <Intro eyebrow="01 Foundations" title="Colours" detail="Canonical semantic tokens are shown first. The second inventory groups every raw colour value found in the same production roots scanned by the UI convergence audit." />
    <Section title="Canonical colour tokens" detail="Use token names by semantic role; current resolved values are shown for comparison.">
      <div className={styles.swatchGrid}>{colourTokens.map((token) => <article className={styles.swatch} key={token.name}>
        <span className={styles.swatchSample} style={{ "--swatch": `var(${token.name})` } as CSSProperties} />
        <span className={styles.swatchCopy}><strong>{colourSemantics[token.name]}</strong><code>{token.name}</code><small>{token.value}</small></span>
      </article>)}</div>
    </Section>
    <Section title="Information treatment" detail="Morrovia uses the canonical ink/lilac feedback treatment for neutral information; there is deliberately no separate information-blue token.">
      <div className={styles.statusStack}><MorroviaStatusBanner title="Your route is ready to review" detail="Nothing has been booked or changed automatically." tone="info" /></div>
    </Section>
    <Section title={`Raw colour inventory · ${inventory.foundations.rawColors.length} grouped values`} detail="Identical values are grouped with occurrence count and representative consumers. Presence is evidence, not an automatic migration decision.">
      <div className={styles.swatchGrid}>{inventory.foundations.rawColors.map((record) => <article className={styles.swatch} key={record.value}>
        <span className={styles.swatchSample} style={{ "--swatch": record.value } as CSSProperties} />
        <span className={styles.swatchCopy}><strong>{record.value}</strong><code>{record.count} occurrences</code><small>{record.examples.join(" · ")}</small></span>
      </article>)}</div>
    </Section>
  </Catalogue>;
}

export function SpacingFoundation() {
  return <Catalogue><Intro eyebrow="01 Foundations" title="Spacing" detail="Morrovia has no named repository-wide spacing scale today. This is a deterministic inventory of repeated production gaps, padding and margins—not a newly declared scale." />
    <Section title="Observed repeated values" detail="Bars make the relative rhythm visible; counts and representative files show where each value comes from."><InventoryList records={inventory.foundations.observedSpacing} visual="spacing" /></Section>
  </Catalogue>;
}

export function BordersRadiiFoundation() {
  const canonical = [
    { value: "var(--morrovia-control-radius)", count: 1, examples: ["Controls and compact interactions"] },
    { value: "var(--morrovia-radius)", count: 1, examples: ["Editorial cards and larger panels"] },
  ];
  return <Catalogue><Intro eyebrow="01 Foundations" title="Borders & radii" detail="The canonical line and two named radius roles are compared with grouped numeric radius declarations from production CSS." />
    <Section title="Canonical roles" detail="--morrovia-line is the low-emphasis border; curvature depends on interaction size."><InventoryList records={canonical} visual="radius" /></Section>
    <Section title={`Raw radius inventory · ${inventory.foundations.rawRadii.length} grouped values`} detail="Close values may be migration candidates or legitimate product anatomy; Storybook keeps that decision visible."><InventoryList records={inventory.foundations.rawRadii} visual="radius" /></Section>
  </Catalogue>;
}

export function ShadowsFoundation() {
  const canonical = [
    { value: "var(--morrovia-focus-shadow)", count: 1, examples: ["Canonical 3px keyboard-focus treatment"] },
    { value: "var(--morrovia-shadow-overlay)", count: 1, examples: ["Overlay, dialog and elevated popover hierarchy"] },
  ];
  return <Catalogue><Intro eyebrow="01 Foundations" title="Shadows" detail="Morrovia names keyboard focus and overlay elevation. Raw card and panel shadows remain grouped evidence until their semantic jobs are reviewed." />
    <Section title="Canonical semantic roles" detail="Focus identifies keyboard interaction; overlay elevation establishes modal hierarchy. Ordinary cards should borrow neither role."><InventoryList records={canonical} visual="shadow" /></Section>
    <Section title={`Raw shadow inventory · ${inventory.foundations.rawShadows.length} grouped values`} detail="Values are shown exactly as declared, with counts and representative owners."><InventoryList records={inventory.foundations.rawShadows} visual="shadow" /></Section>
  </Catalogue>;
}

export function IconsFoundation() {
  const icons = [MapPin, Route, CalendarDays, Clock3, TrainFront, BedDouble, Utensils, Search, Sparkles, ShieldCheck, CheckCircle2, AlertTriangle, Stamp, Bot, Plus, Ellipsis, Map];
  return <Catalogue><Intro eyebrow="01 Foundations" title="Icons" detail="Morrovia uses Lucide. Shared actions inherit their icon contract from the component; spatial markers and identity marks stay product-owned." />
    <div className={styles.iconGrid}>{icons.map((Icon, index) => <article className={styles.iconCard} key={`${Icon.displayName ?? Icon.name}-${index}`}><Icon aria-hidden="true" /><small>{Icon.displayName ?? Icon.name}</small></article>)}</div>
    <Section title="Action sizing and labels" detail="The actual EasyTButton component owns action icon sizing, accessible icon-only labels, disabled and loading states."><div className={styles.controlRow}><EasyTButton icon={Plus}>Add stop</EasyTButton><EasyTButton icon={Ellipsis} iconOnly aria-label="More actions">More actions</EasyTButton><EasyTButton icon={Route} variant="secondary">View full map</EasyTButton></div></Section>
  </Catalogue>;
}

export function LayoutFoundation() {
  const tracks = [
    ["Editorial page", "var(--morrovia-page)", "1180px maximum with 48px desktop and 32px mobile total gutters"],
    ["Trip workspace", "100%", "TripShell owns a wider working area for Overview, Map and Itinerary"],
    ["Map / Builder / Stamps", "100%", "Intentional wide-canvas or focused-workflow exceptions"],
  ] as const;
  return <Catalogue><Intro eyebrow="01 Foundations" title="Layout & widths" detail="Page widths follow the traveller job. The standard editorial width is canonical; workspace, spatial and workflow surfaces deliberately diverge." />
    <div className={styles.grid}>{tracks.map(([label, width, detail]) => <article className={styles.layoutTrack} key={label}><strong>{label}</strong><span style={{ "--track-width": width } as CSSProperties} /><small>{detail}</small></article>)}</div>
    <p className={styles.note}>Common layout gaps remain component-owned. Map, Builder and Stamps must not be forced into the editorial width merely for visual sameness.</p>
  </Catalogue>;
}

export function BreakpointsFoundation() {
  return <Catalogue><Intro eyebrow="01 Foundations" title="Breakpoints" detail="Breakpoints are page-specific where the job demands it. This grouped inventory makes current clusters visible without inventing a new global breakpoint system." />
    <Section title="Configured review widths" detail="Storybook provides 320, 390, 430, 768, 1024, 1440 and 1680 viewports for production-real responsive review."><div className={styles.responsiveStrip}>{[320, 390, 768, 1024, 1440].map((width) => <article key={width}><strong>{width}</strong><span>CSS pixels · inspect reflow, target size, contained scrolling and page overflow</span></article>)}</div></Section>
    <Section title={`Production media-query inventory · ${inventory.foundations.breakpoints.length} grouped values`} detail="Counts show recurrence, not canonical status."><InventoryList records={inventory.foundations.breakpoints} /></Section>
  </Catalogue>;
}

function classificationKey(classification: VisualAuditClassification) {
  if (classification === "CANONICAL") return "canonical";
  if (classification === "DUPLICATE / MIGRATION CANDIDATE") return "duplicate";
  if (classification === "INTENTIONAL EXCEPTION") return "intentional";
  return "undecided";
}

function classificationLabel(classification: VisualAuditClassification) {
  return classification === "DUPLICATE / MIGRATION CANDIDATE" ? "MIGRATION DEBT" : classification;
}

export function AuditRecords({ families }: { families?: string[] }) {
  const records = families?.length ? visualAuditRecords.filter((record) => families.includes(record.family)) : visualAuditRecords;
  return <div className={styles.recordGrid}>{records.map((record) => <article className={styles.record} data-classification={classificationKey(record.classification)} key={`${record.family}-${record.implementation}`}>
    <header className={styles.recordHead}><span className={styles.classification}>{classificationLabel(record.classification)}</span><h3>{record.implementation}</h3></header>
    <dl><div><dt>Semantic job</dt><dd>{record.semanticJob}</dd></div><div><dt>Owner</dt><dd>{record.owner}</dd></div><div><dt>Consumers</dt><dd>{record.consumers.join(" · ")}</dd></div>{record.canonicalReference ? <div><dt>Canonical reference</dt><dd>{record.canonicalReference}</dd></div> : null}<div><dt>Differences</dt><dd>{record.differences}</dd></div><div><dt>Coverage</dt><dd>{record.storybookCoverage}</dd></div><div><dt>Status</dt><dd>{record.migrationStatus}</dd></div></dl>
  </article>)}</div>;
}

export function AuditCanonicalOwnership() {
  return <Catalogue><Intro eyebrow="06 Audit" title="Canonical ownership" detail={`${canonicalUiOwners.length} recurring semantic families answer who owns the implementation, where it is reviewed, which states matter and where composition must stop.`} />
    <div className={styles.recordGrid}>{canonicalUiOwners.map((record) => <article className={styles.record} data-classification="canonical" key={record.family}>
      <header className={styles.recordHead}><span className={styles.classification}>CANONICAL OWNER</span><h3>{record.family}</h3></header>
      <dl><div><dt>Semantic job</dt><dd>{record.semanticJob}</dd></div><div><dt>Owner</dt><dd>{record.owner}</dd></div><div><dt>Coverage</dt><dd>{record.storybookCoverage}</dd></div><div><dt>Meaningful states</dt><dd>{record.meaningfulStates.join(" · ")}</dd></div><div><dt>Boundary</dt><dd>{record.boundary}</dd></div></dl>
    </article>)}</div>
  </Catalogue>;
}

export function AuditOverview() {
  const summary = visualAuditSummary();
  return <Catalogue><Intro eyebrow="06 Audit" title="Visual-system inventory" detail="Every record states the semantic job, production owner, consumers, visible differences, Storybook coverage and review status. Storybook exposes evidence; it does not perform the migration." />
    <div className={styles.summaryGrid}>
      <article className={styles.metric}><strong>{summary.families}</strong><span>semantic component and pattern families represented</span></article>
      <article className={styles.metric}><strong>{summary.duplicateFamilies}</strong><span>duplicate-equivalent families identified</span></article>
      <article className={styles.metric}><strong>{summary.counts.CANONICAL}</strong><span>implementations marked canonical</span></article>
      <article className={styles.metric}><strong>{summary.counts["DUPLICATE / MIGRATION CANDIDATE"]}</strong><span>implementations marked migration debt</span></article>
      <article className={styles.metric}><strong>{summary.counts["INTENTIONAL EXCEPTION"]}</strong><span>implementations marked intentional exception</span></article>
      <article className={styles.metric}><strong>{summary.counts.UNDECIDED}</strong><span>implementations still undecided</span></article>
    </div>
    <Section title="Repository drift signals" detail="These totals come from the same deterministic audit used by npm run audit:ui."><div className={styles.summaryGrid}>{Object.entries(inventory.audit.totals).map(([rule, count]) => <article className={styles.metric} key={rule}><strong>{count}</strong><span>{rule}</span></article>)}</div></Section>
    <AuditRecords />
  </Catalogue>;
}

export function AuditTypography() {
  return <Catalogue><Intro eyebrow="06 Audit" title="Typography comparison" detail="Canonical family roles and intentional production-owned headline selectors are shown together. Legacy family declarations are fully migrated; the absence of a global type-size scale remains explicit." /><ProductionTypographyComparison /><AuditRecords families={["Typography", "Section headers"]} /></Catalogue>;
}

export function AuditColours() {
  return <Catalogue><Intro eyebrow="06 Audit" title="Colour comparison" detail="Semantic tokens are canonical. Grouped raw values are migration evidence, not automatic replacements." /><Section title="Highest-frequency raw values" detail="The full visual inventory lives in 01 Foundations / Colours."><div className={styles.swatchGrid}>{inventory.foundations.rawColors.slice(0, 24).map((record) => <article className={styles.swatch} key={record.value}><span className={styles.swatchSample} style={{ "--swatch": record.value } as CSSProperties} /><span className={styles.swatchCopy}><strong>{record.value}</strong><code>{record.count} occurrences</code><small>{record.examples.join(" · ")}</small></span></article>)}</div></Section><AuditRecords families={["Colour"]} /></Catalogue>;
}

export function AuditButtons() {
  return <Catalogue><Intro eyebrow="06 Audit" title="Button comparison" detail="The canonical shared component is rendered directly. Page-bound composite buttons are documented from their production owners rather than recreated by eye." />
    <div className={styles.comparisonGrid}><section className={styles.comparisonPanel}><span className={styles.classification}>CANONICAL</span><h2>EasyTButton / EasyTLinkButton</h2><div className={styles.controlRow}><EasyTButton>Primary action</EasyTButton><EasyTButton variant="secondary">Secondary</EasyTButton><EasyTButton variant="quiet">Quiet</EasyTButton><EasyTButton variant="danger">Destructive</EasyTButton><EasyTButton loading>Pending</EasyTButton><EasyTButton disabled>Disabled</EasyTButton><EasyTButton autoFocus>Keyboard focus</EasyTButton></div></section><section className={styles.comparisonPanel}><span className={styles.classification}>MIGRATION DEBT</span><h2>Page-bound action families</h2><p className={styles.note}>Passport submit, Dashboard status segments and simple gift actions now use the canonical controls. Builder, Map, planning, Stamps and the remaining Dashboard composites retain their production interaction contracts pending keyboard proof.</p><AuditLeaderList records={inventory.audit.leaders["native-control"]} /></section></div>
    <AuditRecords families={["Buttons"]} />
  </Catalogue>;
}

export function AuditFormControls() {
  return <Catalogue><Intro eyebrow="06 Audit" title="Form-control comparison" detail="Canonical fields are rendered directly with focus, disabled and error states. Page-local controls remain documented migration candidates where semantics match." />
    <div className={styles.comparisonGrid}><section className={styles.comparisonPanel}><span className={styles.classification}>CANONICAL</span><h2>Shared labelled controls</h2><div className={styles.fieldStack}><EasyTField label="Destination" placeholder="Where would you like to go?" /><EasyTField label="Starting point" defaultValue="London" autoFocus /><EasyTField label="Destination" defaultValue="Atlantis" error="Choose a real mapped place." /><EasyTTextArea label="Notes" optional placeholder="Anything else we should consider?" /><EasyTSelect label="Travel style" defaultValue="balanced"><option value="relaxed">Relaxed</option><option value="balanced">Balanced</option><option value="full">Full days</option></EasyTSelect></div></section><section className={styles.comparisonPanel}><span className={styles.classification}>MIGRATION DEBT</span><h2>Local production controls</h2><AuditLeaderList records={inventory.audit.leaders["native-control"]} /><p className={styles.note}>Passport selectors, Discover filters and Dashboard gift fields are migrated. Native anatomy inside Map, Tour, search and other composite widgets remains subject to keyboard and focus proof.</p></section></div>
    <AuditRecords families={["Form controls", "Date & quantity controls"]} />
  </Catalogue>;
}

export function AuditCards() {
  return <Catalogue><Intro eyebrow="06 Audit" title="Card comparison" detail="Morrovia intentionally has no universal card primitive. Radius and shadow inventories expose drift while product-pattern stories preserve real anatomy." /><div className={styles.comparisonGrid}><section className={styles.comparisonPanel}><h2>Repeated radius values</h2><InventoryList records={inventory.foundations.rawRadii.slice(0, 18)} visual="radius" /></section><section className={styles.comparisonPanel}><h2>Repeated shadow values</h2><InventoryList records={inventory.foundations.rawShadows.slice(0, 18)} visual="shadow" /></section></div><AuditRecords families={["Borders & radii", "Shadows", "Cards & panels"]} /></Catalogue>;
}

export function AuditStatus() {
  return <Catalogue><Intro eyebrow="06 Audit" title="Status comparison" detail="Generic safety and persistence truth has a canonical component. Domain health, timing, booking and readiness state remains product-owned." />
    <div className={styles.comparisonGrid}><section className={styles.comparisonPanel}><span className={styles.classification}>CANONICAL</span><h2>Persistent status</h2><div className={styles.statusStack}><MorroviaStatusBanner title="Saved to your account" detail="Your trip is up to date on this device and in the cloud." tone="success" /><MorroviaStatusBanner title="Device edits kept safe" detail="Resolve the cloud version before applying more changes." tone="warning" /><MorroviaStatusBanner title="The trip could not be saved" detail="Your device copy is unchanged." tone="danger" /></div></section><section className={styles.comparisonPanel}><span className={styles.classification}>INTENTIONAL EXCEPTION</span><h2>Trip-quality state</h2><JourneyTripQuality origin="London" startDate="2026-08-20" endDate="2026-08-25" stops={[{ name: "Tokyo", country: "Japan" }]} mentions={[{ sourceText: "Kyoto", canonicalName: "Kyoto", role: "stop", status: "unresolved" }]} onAddMissingPlace={() => {}} onReviewOrigin={() => {}} onReviewDates={() => {}} onReviewTraveller={() => {}} /></section></div>
    <AuditRecords families={["Status & feedback", "Status chips", "Loading & progress"]} />
  </Catalogue>;
}

export function AuditNavigation() {
  return <Catalogue><Intro eyebrow="06 Audit" title="Navigation comparison" detail="Global and trip-local navigation are both production-owned and canonical for different semantic jobs." /><AuditRecords families={["Navigation", "Footer"]} /></Catalogue>;
}

export function AuditProductPatterns() {
  return <Catalogue><Intro eyebrow="06 Audit" title="Product-pattern comparison" detail="Composed patterns are assessed by traveller job, data contract and interaction—not by whether their card outlines look similar." /><AuditRecords families={["Trip capture", "Trip shell", "Overview patterns", "Itinerary patterns", "Map patterns", "Route discovery", "AI / Copilot", "Tour and overlays", "Personal libraries", "Passport"]} /></Catalogue>;
}

export function AuditResponsive() {
  return <Catalogue><Intro eyebrow="06 Audit" title="Responsive comparison" detail="Major composed patterns use Storybook viewport stories instead of fake device frames. The same production owner is exercised at each width." /><div className={styles.responsiveStrip}>{[320, 390, 768, 1024, 1440].map((width) => <article key={width}><strong>{width}</strong><span>{width <= 390 ? "Mobile navigation, stacked workspaces, tap targets and contained horizontal strips" : width === 768 ? "Tablet transitions, stacked rails and dialog width" : "Desktop workspace composition, panels and route context"}</span></article>)}</div><AuditRecords families={["Layout", "Navigation", "Trip shell", "Itinerary patterns", "Map patterns"]} /></Catalogue>;
}

export function AuditIntentionalExceptions() {
  const records = visualAuditRecords.filter((record) => record.classification === "INTENTIONAL EXCEPTION");
  return <Catalogue><Intro eyebrow="06 Audit" title="Intentional exceptions" detail="Every exception names its canonical reference, different traveller job or interaction contract, owner and consumers. Visual difference alone is never sufficient." /><div className={styles.recordGrid}>{records.map((record) => <article className={styles.record} data-classification={classificationKey(record.classification)} key={`${record.family}-${record.implementation}`}><header className={styles.recordHead}><span className={styles.classification}>{record.classification}</span><h3>{record.implementation}</h3></header><dl><div><dt>Semantic job</dt><dd>{record.semanticJob}</dd></div><div><dt>Owner</dt><dd>{record.owner}</dd></div><div><dt>Consumers</dt><dd>{record.consumers.join(" · ")}</dd></div><div><dt>Canonical reference</dt><dd>{record.canonicalReference}</dd></div><div><dt>Reason</dt><dd>{record.differences}</dd></div><div><dt>Status</dt><dd>{record.migrationStatus}</dd></div></dl></article>)}</div></Catalogue>;
}

export function AuditComparisonMatrix({ records }: { records: VisualAuditRecord[] }) {
  return <AuditRecords families={[...new Set(records.map((record) => record.family))]} />;
}
