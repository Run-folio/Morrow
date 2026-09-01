"use client";

import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { EasyTButton, EasyTSelect, EasyTSegmentedControl, EasyTTextArea } from "@/components/easyt/easyt-controls";
import { MorroviaRecoveryFeedback, MorroviaStatusBanner } from "@/components/easyt/morrovia-feedback";
import { authClient } from "@/lib/auth-client";
import {
  buildSpreadsheetImportProposal,
  canonicalTripFromSpreadsheetProposal,
  parseDelimitedText,
  spreadsheetColumnMappings,
  SPREADSHEET_IMPORT_LIMITS,
  type ResolvedImportOrigin,
  type ResolvedImportPlace,
  type SpreadsheetColumnMapping,
  type SpreadsheetImportField,
  type SpreadsheetImportProposal,
  type SpreadsheetTable,
} from "@/lib/easyt/spreadsheet-import";
import { parseSpreadsheetWorkbook } from "@/lib/easyt/spreadsheet-import-file";
import { cacheCanonicalTrip, saveTripRecovery, saveTripRecoveryToEasyT } from "@/lib/easyt/storage";
import { tripBuildDocumentsCanonicalEquivalent } from "@/lib/easyt/trip-promotion";
import { firstTripWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import { SpreadsheetImportReview, type SpreadsheetImportPlaceCandidate } from "./spreadsheet-import-review";
import styles from "./spreadsheet-import.module.css";

type PlaceCandidate = SpreadsheetImportPlaceCandidate;

function placeFromCandidate(sourceStopId: string, candidate: PlaceCandidate): ResolvedImportPlace {
  return { sourceStopId, ...candidate };
}

async function placeResponse(name: string, country: string) {
  const countryQuery = country ? `&country=${encodeURIComponent(country)}` : "";
  const direct = await fetch(`/api/journey-geocode?place=${encodeURIComponent(name)}${countryQuery}`);
  const directPayload = direct.ok ? await direct.json() as { result?: PlaceCandidate | null } : {};
  if (directPayload.result?.coordinates) return { result: directPayload.result, candidates: [] as PlaceCandidate[] };
  const candidatesResponse = await fetch(`/api/journey-geocode?place=${encodeURIComponent(name)}&candidates=1${countryQuery}`);
  const candidatesPayload = candidatesResponse.ok ? await candidatesResponse.json() as { candidates?: PlaceCandidate[] } : {};
  return { result: null, candidates: candidatesPayload.candidates ?? [] };
}

export default function SpreadsheetImportClient() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [pasteValue, setPasteValue] = useState("");
  const [sheets, setSheets] = useState<SpreadsheetTable[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mappings, setMappings] = useState<SpreadsheetColumnMapping[]>([]);
  const [inputError, setInputError] = useState("");
  const [reading, setReading] = useState(false);
  const [resolvedPlaces, setResolvedPlaces] = useState<Record<string, ResolvedImportPlace>>({});
  const [placeOptions, setPlaceOptions] = useState<Record<string, PlaceCandidate[]>>({});
  const [resolvingPlaces, setResolvingPlaces] = useState(false);
  const [originValue, setOriginValue] = useState("");
  const [resolvedOrigin, setResolvedOrigin] = useState<ResolvedImportOrigin | null>(null);
  const [originOptions, setOriginOptions] = useState<PlaceCandidate[]>([]);
  const [originError, setOriginError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const table = sheets[sheetIndex] ?? null;
  const proposal = useMemo<SpreadsheetImportProposal | null>(() => table ? buildSpreadsheetImportProposal(table, mappings) : null, [mappings, table]);

  const selectTable = (nextSheets: SpreadsheetTable[], nextIndex = 0) => {
    const nextTable = nextSheets[nextIndex];
    setSheets(nextSheets);
    setSheetIndex(nextIndex);
    setMappings(spreadsheetColumnMappings(nextTable.headers));
    setOriginValue("");
    setResolvedOrigin(null);
    setOriginOptions([]);
    setResolvedPlaces({});
    setPlaceOptions({});
    setInputError("");
    setSaveError("");
  };

  const chooseSheet = (index: number) => {
    setSheetIndex(index);
    setMappings(spreadsheetColumnMappings(sheets[index].headers));
    setOriginValue("");
    setResolvedOrigin(null);
    setOriginOptions([]);
    setResolvedPlaces({});
    setPlaceOptions({});
    setSaveError("");
  };

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setReading(true);
    setInputError("");
    try {
      if (file.size > SPREADSHEET_IMPORT_LIMITS.fileBytes) throw new Error("The file is larger than the 5 MB V1 limit.");
      const extension = file.name.toLocaleLowerCase().split(".").at(-1);
      if (extension === "csv") selectTable([parseDelimitedText(await file.text(), file.name)]);
      else if (extension === "xlsx") selectTable(parseSpreadsheetWorkbook(await file.arrayBuffer(), file.name).sheets);
      else throw new Error("Choose a CSV or XLSX file. Older XLS and macro-enabled XLSM files are not supported in V1.");
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "Morrovia could not read this spreadsheet.");
    } finally {
      setReading(false);
      event.target.value = "";
    }
  };

  const parsePaste = () => {
    setInputError("");
    try { selectTable([parseDelimitedText(pasteValue, "Pasted table")]); }
    catch (error) { setInputError(error instanceof Error ? error.message : "Morrovia could not read this pasted table."); }
  };

  const updateMapping = (columnIndex: number, value: string) => {
    const field = value === "ignore" ? null : value as SpreadsheetImportField;
    setMappings((current) => current.map((mapping) => {
      if (mapping.index === columnIndex) return { ...mapping, field, state: field ? "mapped" : "ignored", suggestions: field ? [field] : [] };
      if (field && mapping.field === field) return { ...mapping, field: null, state: "ignored", suggestions: [] };
      return mapping;
    }));
    setResolvedPlaces({});
    setPlaceOptions({});
    setSaveError("");
  };

  useEffect(() => {
    if (!proposal) return;
    setOriginValue((current) => current || proposal.origin || "");
  }, [proposal?.sourceName, proposal?.origin]);

  useEffect(() => {
    if (!proposal?.origin || resolvedOrigin || originValue.trim() !== proposal.origin.trim()) return;
    let cancelled = false;
    const resolve = async () => {
      try {
        const response = await placeResponse(proposal.origin!, "");
        if (cancelled) return;
        if (response.result) {
          setResolvedOrigin(response.result);
        } else {
          setOriginOptions(response.candidates);
          setOriginError(response.candidates.length ? "Choose the intended place." : "Morrovia could not verify this starting point. Check the spelling and try again.");
        }
      } catch {
        if (!cancelled) setOriginError("Place checking is temporarily unavailable. Your spreadsheet remains in this browser.");
      }
    };
    void resolve();
    return () => { cancelled = true; };
  }, [proposal?.sourceName, proposal?.origin, originValue, resolvedOrigin]);

  useEffect(() => {
    if (!proposal?.stops.length) return;
    let cancelled = false;
    const resolve = async () => {
      setResolvingPlaces(true);
      const results = await Promise.all(proposal.stops.map(async (stop) => {
        try { return { stop, ...(await placeResponse(stop.name, stop.country)) }; }
        catch { return { stop, result: null, candidates: [] as PlaceCandidate[] }; }
      }));
      if (cancelled) return;
      const nextResolved: Record<string, ResolvedImportPlace> = {};
      const nextOptions: Record<string, PlaceCandidate[]> = {};
      for (const { stop, result, candidates } of results) {
        if (result) nextResolved[stop.id] = placeFromCandidate(stop.id, result);
        else nextOptions[stop.id] = candidates;
      }
      setResolvedPlaces(nextResolved);
      setPlaceOptions(nextOptions);
      setResolvingPlaces(false);
    };
    void resolve();
    return () => { cancelled = true; };
  }, [proposal?.sourceName, proposal?.stops.map((stop) => `${stop.id}:${stop.name}:${stop.country}`).join("|")]);

  const resolveOrigin = async () => {
    if (!originValue.trim()) { setOriginError("Add the city or airport where the trip starts."); return; }
    setOriginError("");
    setOriginOptions([]);
    try {
      const response = await placeResponse(originValue.trim(), "");
      if (response.result) { setResolvedOrigin(response.result); setOriginValue(response.result.name); return; }
      setResolvedOrigin(null);
      setOriginOptions(response.candidates);
      setOriginError(response.candidates.length ? "Choose the intended place." : "Morrovia could not verify this starting point. Check the spelling and try again.");
    } catch {
      setOriginError("Place checking is temporarily unavailable. Your spreadsheet remains in this browser.");
    }
  };

  const reset = () => {
    setSheets([]);
    setMappings([]);
    setPasteValue("");
    setInputError("");
    setResolvedPlaces({});
    setPlaceOptions({});
    setResolvedOrigin(null);
    setOriginOptions([]);
    setOriginValue("");
    setSaveError("");
  };

  const allPlacesResolved = Boolean(proposal?.stops.length) && proposal!.stops.every((stop) => resolvedPlaces[stop.id]);
  const canConfirm = Boolean(proposal?.canConfirmStructure && resolvedOrigin && allPlacesResolved && !resolvingPlaces && !sessionPending);

  const confirm = async () => {
    if (!proposal || !resolvedOrigin || !canConfirm || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const trip = canonicalTripFromSpreadsheetProposal({
        id: `trip-${crypto.randomUUID()}`,
        proposal,
        origin: resolvedOrigin,
        places: proposal.stops.map((stop) => resolvedPlaces[stop.id]),
      });
      const ownerId = session?.user?.id ?? null;
      const recovery = saveTripRecovery(trip, { ownerId });
      if (!recovery.stored) throw new Error(recovery.blockedByExistingRecovery
        ? "A different recovery copy already exists on this device. Open or resolve it before importing another trip."
        : "This browser could not preserve the reviewed trip. Keep this page open and check private-browsing or storage settings.");
      if (!ownerId) {
        window.location.assign(firstTripWorkspaceHref(trip.id));
        return;
      }
      const saved = await saveTripRecoveryToEasyT(trip, recovery.handle);
      if (saved.id !== trip.id || saved.ownerId !== ownerId || !tripBuildDocumentsCanonicalEquivalent(trip, saved, ownerId)) {
        throw new Error("The account save did not match the trip you reviewed. The reviewed copy remains recoverable on this device.");
      }
      const cached = cacheCanonicalTrip(saved, recovery.handle);
      if (!cached.stored || !cached.recoveryResolved) throw new Error("The trip reached your account, but this browser could not acknowledge the save. Keep this page open and retry.");
      window.location.assign(firstTripWorkspaceHref(saved.id));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Morrovia could not save this trip. The reviewed information has not been silently changed.");
      setSaving(false);
    }
  };

  return <div className={styles.boundary}>
    <Link className={styles.back} href="/journey/new"><ArrowLeft aria-hidden="true" /> Back to trip creation</Link>
    {!table ? <header className={styles.hero}>
      <p>IMPORT EXISTING TRIP</p>
      <h1>Bring your trip into Morrovia.</h1>
      <span>Upload or paste what you already have. Nothing becomes a trip until you review and confirm it.</span>
    </header> : null}

    {!table ? <section className={styles.inputPanel} aria-labelledby="import-source-title">
      <div className={styles.sectionHeading}>
        <div><span>STEP 1</span><h2 id="import-source-title">Choose your source</h2><p>CSV, XLSX, or a copied spreadsheet table.</p></div>
        <FileSpreadsheet aria-hidden="true" />
      </div>
      <EasyTSegmentedControl ariaLabel="Import source" value={inputMode} onChange={setInputMode} options={[{ value: "file", label: "Upload file", controls: "import-file" }, { value: "paste", label: "Paste table", controls: "import-paste" }]} />
      {inputMode === "file" ? <div id="import-file" className={styles.filePanel}>
        <Upload aria-hidden="true" />
        <div><strong>Choose a CSV or XLSX file</strong><span>Up to 5 MB, 1,000 rows and 60 columns. XLS, XLSM and merged multi-sheet imports are not supported.</span></div>
        <label className={styles.fileAction}>
          <span>{reading ? "Reading…" : "Choose file"}</span>
          <input type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={reading} onChange={readFile} />
        </label>
      </div> : <div id="import-paste" className={styles.pastePanel}>
        <EasyTTextArea label="Spreadsheet rows" value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} rows={9} placeholder={"Destination\tArrival date\tDeparture date\nTokyo\t2027-04-02\t2027-04-06"} hint="Include the header row. Tabs, commas and semicolons are supported." />
        <EasyTButton icon={FileSpreadsheet} onClick={parsePaste} disabled={!pasteValue.trim()}>Review pasted table</EasyTButton>
      </div>}
      {inputError ? <MorroviaRecoveryFeedback title="We could not read that source" detail={inputError} safety="No trip was created and the original file was not stored." /> : null}
      <MorroviaStatusBanner tone="info" title="Parsed privately in this browser" detail="Morrovia does not upload the original file, execute formulas or macros, fetch spreadsheet links, or send rows to an AI service." />
    </section> : <>
      {sheets.length > 1 ? <section className={styles.sheetChoice}>
        <MorroviaStatusBanner tone="warning" title={`${sheets.length} plausible worksheets found`} detail="Choose one worksheet. Morrovia does not merge unrelated sheets in V1." />
        <EasyTSelect label="Worksheet" value={String(sheetIndex)} onChange={(event) => chooseSheet(Number(event.target.value))}>{sheets.map((sheet, index) => <option value={index} key={sheet.name}>{sheet.name} — {sheet.rows.length} rows</option>)}</EasyTSelect>
      </section> : null}
      {proposal ? <SpreadsheetImportReview
        proposal={proposal}
        mappings={mappings}
        sourceRowCount={table.rows.length}
        sourceColumnCount={table.headers.length}
        resolvedPlaces={resolvedPlaces}
        placeOptions={placeOptions}
        resolvingPlaces={resolvingPlaces}
        originValue={originValue}
        resolvedOrigin={resolvedOrigin}
        originOptions={originOptions}
        originError={originError}
        saving={saving}
        saveError={saveError}
        canConfirm={canConfirm}
        onReset={reset}
        onUpdateMapping={updateMapping}
        onOriginValueChange={(value) => { setOriginValue(value); setResolvedOrigin(null); setOriginOptions([]); setOriginError(""); }}
        onResolveOrigin={() => void resolveOrigin()}
        onSelectOrigin={(option) => { setResolvedOrigin(option); setOriginValue(option.name); setOriginError(""); }}
        onSelectPlace={(stopId, option) => setResolvedPlaces((current) => ({ ...current, [stopId]: placeFromCandidate(stopId, option) }))}
        onConfirm={() => void confirm()}
      /> : null}
    </>}
  </div>;
}
