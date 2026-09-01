# Spreadsheet trip import V1

Spreadsheet import is an additional Builder entry for travellers who already
have a multi-stop trip in CSV, XLSX, or copied tabular form. It does not replace
natural-language or manual trip creation.

## Architecture and trust boundary

1. The browser reads the selected file or pasted text.
2. Deterministic parsing produces an in-memory proposal made of column
   mappings, recognised rows, unresolved rows, conflicts, and conservative
   duplicate findings.
3. The traveller reviews column meanings, resolves geography through the
   existing Morrovia place-resolution route, and supplies a trip origin when
   it was not present.
4. Explicit confirmation converts the reviewed proposal with
   `tripFromBuilder`, enriches the resulting canonical `EasyTTrip` with only
   confirmed `TripStop`, `TripBooking`, `TripLeg`, `PlanItem`, and `dayNotes`
   fields, and saves through the normal recovery and account-persistence path.

The proposal is temporary and is not another canonical trip model. Parsing
does not create, mutate, or persist a trip. A confirmed import has no continuing
dependency on the source spreadsheet.

## Privacy and file handling

There is no temporary server upload or storage of the original CSV/XLSX in V1.
The browser discards its file reference when the page is reset or closed.
Spreadsheet rows are not sent to an AI service. During review, only the place
name and optional country needed for an explicit canonical geography check are
sent to Morrovia's existing `/api/journey-geocode` route. Confirmed canonical
trip facts then use normal Morrovia persistence.

XLSX parsing disables VBA, formula retention, HTML, styles, dependencies, and
embedded file extraction. Macros and formulas are never executed. A formula
cell may contribute its cached scalar value when the workbook already contains
one. Embedded URLs, images, relationships, and remote references are never
fetched.

V1 limits are 5 MB, 1,000 data rows, 60 columns, and 5,000 characters per
cell. Hidden, blank, and non-tabular worksheets are not offered for import.
Multiple plausible visible worksheets are presented individually and are never
merged.

## Deliberately unsupported in V1

- XLS and XLSM files, password-protected or encrypted workbooks
- merged multi-sheet trips or relational/cross-sheet layouts
- merged-cell or presentation-oriented spreadsheets without a single header row
- live sync, recurring imports, write-back, Google OAuth, or Google Sheets API
- arbitrary AI interpretation or inferred dates, times, booking state, routes,
  activity relationships, or transport modes
- accommodation without a reference plus reliable stop dates
- transport without explicit from, to, date, and reference
- activities without an explicit activity date and a matching stop range
