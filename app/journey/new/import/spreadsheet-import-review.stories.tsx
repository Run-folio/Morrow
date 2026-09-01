import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildSpreadsheetImportProposal, parseDelimitedText, type ResolvedImportOrigin, type ResolvedImportPlace, type SpreadsheetImportIssue } from "@/lib/easyt/spreadsheet-import";
import { cleanFiveStopTripCsv } from "../../../../tests/fixtures/spreadsheet-import";
import { SpreadsheetImportReview, type SpreadsheetImportPlaceCandidate } from "./spreadsheet-import-review";

type ReviewState = "clean" | "attention" | "partial" | "mapping";

const table = parseDelimitedText(cleanFiveStopTripCsv, "Trip.xlsx");
const cleanProposal = buildSpreadsheetImportProposal(table);
const cleanSkippedIssues: SpreadsheetImportIssue[] = [12, 13, 14, 15, 16].flatMap((rowNumber, index) => [
  { id: `duplicate-reference-${rowNumber}`, status: "not-imported" as const, title: "Duplicate booking reference not imported", detail: `Reference “DUP-${index + 1}” already appears in an earlier booking.`, rowNumber },
  { id: `stay-incomplete-${rowNumber}`, status: "not-imported" as const, title: "Hotel not imported as booked", detail: "The related stay fields belong to the repeated booking row.", rowNumber },
]).concat([17, 18, 19, 20, 21].map((rowNumber) => ({
  id: `incomplete-entry-${rowNumber}`,
  status: "not-imported" as const,
  title: "Incomplete entry ignored",
  detail: "This row did not contain enough supported trip information.",
  rowNumber,
})));
const cleanReviewProposal = {
  ...cleanProposal,
  issues: cleanSkippedIssues,
  rows: [
    ...cleanProposal.rows,
    ...[12, 13, 14, 15, 16].map((rowNumber) => ({ rowNumber, status: "not-imported" as const, recognised: [], detail: "Repeated booking row" })),
    ...[17, 18, 19, 20, 21].map((rowNumber) => ({ rowNumber, status: "not-imported" as const, recognised: [], detail: "Duplicate or incomplete entry" })),
  ],
};
const origin: ResolvedImportOrigin = {
  canonicalPlaceId: "fixture:london",
  name: "London",
  country: "United Kingdom",
  countryCode: "GB",
  coordinates: [-0.1276, 51.5072],
};

function resolvedPlaces(proposal = cleanProposal) {
  return Object.fromEntries(proposal.stops.map((stop, index) => [stop.id, {
    sourceStopId: stop.id,
    canonicalPlaceId: `fixture:${stop.name.toLocaleLowerCase()}`,
    name: stop.name,
    country: stop.country,
    countryCode: stop.country === "France" ? "FR" : stop.country === "Spain" ? "ES" : "PT",
    coordinates: [-9 + index * 2, 39 + index],
  } satisfies ResolvedImportPlace]));
}

function ReviewFixture({ state }: { state: ReviewState }) {
  const mappings = state === "attention"
    ? cleanProposal.columns.map((mapping) => mapping.field === "activityDate" ? { ...mapping, header: "Date", field: null, state: "ambiguous" as const, suggestions: ["activityDate" as const, "transportDate" as const] } : mapping)
    : state === "mapping"
      ? cleanProposal.columns.map((mapping) => mapping.field === "destination" ? { ...mapping, header: "Place", field: null, state: "ambiguous" as const, suggestions: ["destination" as const, "origin" as const] } : mapping)
      : cleanProposal.columns;
  const proposal = state === "clean" ? cleanReviewProposal : state === "partial" ? {
    ...cleanProposal,
    activities: cleanProposal.activities.slice(0, 8),
    issues: [
      { id: "duplicate-row-10", status: "not-imported" as const, title: "Duplicate row not imported", detail: "This row repeats information already included.", rowNumber: 10 },
      { id: "unassigned-note-11", status: "not-imported" as const, title: "Note has no reliable trip date", detail: "The note remains visible here but was not converted into a structured fact.", rowNumber: 11 },
    ],
  } : cleanProposal;
  const places = resolvedPlaces(proposal);
  if (state === "attention") delete places[proposal.stops[2].id];
  const madridCandidate: SpreadsheetImportPlaceCandidate = {
    canonicalPlaceId: "fixture:madrid",
    name: "Madrid",
    country: "Spain",
    countryCode: "ES",
    coordinates: [-3.7038, 40.4168],
  };
  const canConfirm = state === "clean" || state === "partial";

  return <main className="morrovia-editorial-page" style={{ minHeight: "100vh", padding: 24 }}>
    <div style={{ width: "min(100%, 960px)", margin: "0 auto" }}>
      <SpreadsheetImportReview
        proposal={proposal}
        mappings={mappings}
        sourceRowCount={proposal.rows.length}
        sourceColumnCount={table.headers.length}
        resolvedPlaces={places}
        placeOptions={state === "attention" ? { [proposal.stops[2].id]: [madridCandidate] } : {}}
        resolvingPlaces={false}
        originValue={state === "mapping" ? "" : "London"}
        resolvedOrigin={state === "mapping" ? null : origin}
        originOptions={[]}
        originError=""
        saving={false}
        saveError=""
        canConfirm={canConfirm}
        onReset={() => undefined}
        onUpdateMapping={() => undefined}
        onOriginValueChange={() => undefined}
        onResolveOrigin={() => undefined}
        onSelectOrigin={() => undefined}
        onSelectPlace={() => undefined}
        onConfirm={() => undefined}
      />
    </div>
  </main>;
}

const meta = {
  title: "Morrovia/05 Product Patterns/Spreadsheet import review",
  component: ReviewFixture,
  args: { state: "clean" },
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof ReviewFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CleanImport: Story = { args: { state: "clean" } };
export const NeedsAttention: Story = { args: { state: "attention" } };
export const PartialImport: Story = { args: { state: "partial" } };
export const MappingRequired: Story = { args: { state: "mapping" } };
export const CleanImportAt390: Story = { args: { state: "clean" }, globals: { viewport: { value: "morrovia390", isRotated: false } } };
