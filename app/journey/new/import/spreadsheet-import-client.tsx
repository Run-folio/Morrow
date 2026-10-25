"use client";

import {createTripCreationToken,loadReservedTripCreation,type TripCreationToken} from "@/lib/easyt/trip-creation-provenance";
import type {EasyTTrip} from "@/lib/easyt/trip";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { EasyTButton, EasyTLinkButton, EasyTSelect, EasyTSegmentedControl, EasyTTextArea } from "@/components/easyt/easyt-controls";
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
import { acceptImportPlace, resolveSpreadsheetImportPlace } from "@/lib/easyt/spreadsheet-import-places";
import { assessSpreadsheetImportTransfers } from "@/lib/easyt/spreadsheet-import-transfers";
import { acknowledgeTripBuildSave, BrowserRecoveryReadError, loadTripRecovery, saveTripRecovery, saveTripRecoveryToEasyT, subscribeToTripStorage } from "@/lib/easyt/storage";
import { pendingSpreadsheetImportForRetry, type PendingSpreadsheetImportSubmission } from "@/lib/easyt/spreadsheet-import-submission";
import { tripSyncRecoveryPath } from "@/lib/easyt/trip-continuity";
import { firstTripWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import { SpreadsheetImportReview, type SpreadsheetImportPlaceCandidate } from "./spreadsheet-import-review";
import styles from "./spreadsheet-import.module.css";

type PlaceCandidate = SpreadsheetImportPlaceCandidate;

function placeFromCandidate(sourceStopId: string, candidate: PlaceCandidate): ResolvedImportPlace {
  const accepted = acceptImportPlace(candidate);
  if (!accepted) throw new Error("Confirm a verified city or town before importing.");
  return { sourceStopId, ...accepted };
}

export default function SpreadsheetImportClient() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const visibleOwnerId = session?.user?.id ?? null;
  const ownerScope = JSON.stringify([visibleOwnerId, sessionPending]);
  const ownerScopeRef = useRef(ownerScope);
  ownerScopeRef.current = ownerScope;
  const mountedRef = useRef(true);
  const confirmationVersionRef = useRef(0);
  const inputVersionRef = useRef(0);
  const fileReadVersionRef = useRef(0);
  const originRequestVersionRef = useRef(0);
  const recoverySourceRevisionRef = useRef(0);
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const inputModeRef = useRef(inputMode);
  inputModeRef.current = inputMode;
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
  const [accountSaveWarning, setAccountSaveWarning] = useState<{ tripId: string; ownerId: string | null; accountAcknowledged: boolean; detail: string; protectedRecovery: boolean } | null>(null);
  const confirmingRef = useRef(false);
  const [reservedCreation,setReservedCreation]=useState<{ownerScope:string;href:string}|null>(null);
  const reservedCreationHref=reservedCreation?.ownerScope===ownerScope?reservedCreation.href:null;
  useEffect(()=>{
    setReservedCreation(null);
    const params=new URLSearchParams(window.location.search),id=params.get("creation"),operation=params.get("creationOperation");
    if(!id||!operation||sessionPending)return;
    let active=true;const ownerId=visibleOwnerId;
    void loadReservedTripCreation(id,operation,ownerId,()=>active&&ownerScopeRef.current===ownerScope).then(reserved=>{
      if(active&&ownerScopeRef.current===ownerScope&&reserved)setReservedCreation({ownerScope,href:`/journey/new?trip=${encodeURIComponent(id)}&creation=${encodeURIComponent(operation)}`});
    }).catch(()=>{});
    return()=>{active=false;};
  },[visibleOwnerId,sessionPending,ownerScope]);
  const creationSubmissionRef=useRef<{reviewedInputKey:string;ownerId:string|null;trip:EasyTTrip;token:TripCreationToken}|null>(null);
  const pendingSubmissionRef = useRef<PendingSpreadsheetImportSubmission | null>(null);
  const transferRequestRef = useRef<AbortController | null>(null);

  const table = sheets[sheetIndex] ?? null;
  const proposal = useMemo<SpreadsheetImportProposal | null>(() => table ? buildSpreadsheetImportProposal(table, mappings) : null, [mappings, table]);
  const proposalRef = useRef(proposal);
  proposalRef.current = proposal;
  const reviewedInputKey = proposal && resolvedOrigin
    ? JSON.stringify({ proposal, origin: resolvedOrigin, places: proposal.stops.map((stop) => resolvedPlaces[stop.id]) })
    : null;
  const reviewedInputKeyRef = useRef(reviewedInputKey);
  reviewedInputKeyRef.current = reviewedInputKey;
  useEffect(() => () => { transferRequestRef.current?.abort(); }, [ownerScope, reviewedInputKey]);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => subscribeToTripStorage(visibleOwnerId, "", () => { recoverySourceRevisionRef.current += 1; }), [visibleOwnerId]);
  useEffect(() => {
    confirmationVersionRef.current += 1;
    inputVersionRef.current += 1;
    fileReadVersionRef.current += 1;
    originRequestVersionRef.current += 1;
    confirmingRef.current = false;
    setSaving(false);
    setReading(false);
    setSaveError("");
    setAccountSaveWarning(null);
  }, [ownerScope]);

  const changeInputMode = (next: "file" | "paste") => {
    if (next === inputModeRef.current) return;
    inputVersionRef.current += 1;
    fileReadVersionRef.current += 1;
    originRequestVersionRef.current += 1;
    inputModeRef.current = next;
    setInputMode(next);
    setReading(false);
    setInputError("");
  };

  const editPastedSource = (value: string) => {
    inputVersionRef.current += 1;
    fileReadVersionRef.current += 1;
    originRequestVersionRef.current += 1;
    setPasteValue(value);
    setReading(false);
    setInputError("");
  };

  const selectTable = (nextSheets: SpreadsheetTable[], nextIndex = 0) => {
    inputVersionRef.current += 1;
    originRequestVersionRef.current += 1;
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
    inputVersionRef.current += 1;
    originRequestVersionRef.current += 1;
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
    if (!file || inputModeRef.current !== "file") return;
    const version = ++inputVersionRef.current;
    const requestVersion = ++fileReadVersionRef.current;
    const isCurrent = () => mountedRef.current && ownerScopeRef.current === ownerScope
      && inputVersionRef.current === version && fileReadVersionRef.current === requestVersion && inputModeRef.current === "file";
    setReading(true);
    setInputError("");
    try {
      if (file.size > SPREADSHEET_IMPORT_LIMITS.fileBytes) throw new Error("The file is larger than the 5 MB V1 limit.");
      const extension = file.name.toLocaleLowerCase().split(".").at(-1);
      if (extension === "csv") {
        const text = await file.text();
        if (!isCurrent()) return;
        selectTable([parseDelimitedText(text, file.name)]);
      } else if (extension === "xlsx") {
        const buffer = await file.arrayBuffer();
        if (!isCurrent()) return;
        selectTable(parseSpreadsheetWorkbook(buffer, file.name).sheets);
      }
      else throw new Error("Choose a CSV or XLSX file. Older XLS and macro-enabled XLSM files are not supported in V1.");
    } catch (error) {
      if (!isCurrent()) return;
      setInputError(error instanceof Error ? error.message : "Morrovia could not read this spreadsheet.");
    } finally {
      if (mountedRef.current && ownerScopeRef.current === ownerScope && fileReadVersionRef.current === requestVersion) {
        setReading(false);
        event.target.value = "";
      }
    }
  };

  const parsePaste = () => {
    setInputError("");
    try { selectTable([parseDelimitedText(pasteValue, "Pasted table")]); }
    catch (error) { setInputError(error instanceof Error ? error.message : "Morrovia could not read this pasted table."); }
  };

  const updateMapping = (columnIndex: number, value: string) => {
    inputVersionRef.current += 1;
    originRequestVersionRef.current += 1;
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
    const requestVersion = ++originRequestVersionRef.current;
    const isCurrent = () => !cancelled && mountedRef.current && ownerScopeRef.current === ownerScope
      && originRequestVersionRef.current === requestVersion;
    const resolve = async () => {
      try {
        const response = await resolveSpreadsheetImportPlace(proposal.origin!, "", "endpoint");
        if (!isCurrent()) return;
        if (response.result) {
          setResolvedOrigin(response.result);
        } else {
          setOriginOptions(response.candidates);
          setOriginError(response.candidates.length ? "Choose the intended place." : "Morrovia could not verify this starting point. Check the spelling and try again.");
        }
      } catch {
        if (isCurrent()) setOriginError("Place checking is temporarily unavailable. Your spreadsheet remains in this browser.");
      }
    };
    void resolve();
    return () => { cancelled = true; };
  }, [ownerScope, table, mappings, proposal?.sourceName, proposal?.origin, originValue, resolvedOrigin]);

  useEffect(() => {
    if (!proposal?.stops.length) return;
    let cancelled = false;
    const resolve = async () => {
      setResolvingPlaces(true);
      const results = await Promise.all(proposal.stops.map(async (stop) => {
        try { return { stop, ...(await resolveSpreadsheetImportPlace(stop.name, stop.country)) }; }
        catch { return { stop, result: null, candidates: [] as PlaceCandidate[] }; }
      }));
      if (cancelled || !mountedRef.current || ownerScopeRef.current !== ownerScope) return;
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
  }, [ownerScope, table, mappings, proposal?.sourceName, proposal?.stops.map((stop) => `${stop.id}:${stop.name}:${stop.country}`).join("|")]);

  const resolveOrigin = async () => {
    if (!originValue.trim()) { setOriginError("Add the city or airport where the trip starts."); return; }
    const inputVersion = inputVersionRef.current;
    const requestVersion = ++originRequestVersionRef.current;
    const isCurrent = () => mountedRef.current && ownerScopeRef.current === ownerScope
      && inputVersionRef.current === inputVersion && originRequestVersionRef.current === requestVersion;
    setOriginError("");
    setOriginOptions([]);
    try {
      const response = await resolveSpreadsheetImportPlace(originValue.trim(), "", "endpoint");
      if (!isCurrent()) return;
      if (response.result) { setResolvedOrigin(response.result); setOriginValue(response.result.name); return; }
      setResolvedOrigin(null);
      setOriginOptions(response.candidates);
      setOriginError(response.candidates.length ? "Choose the intended place." : "Morrovia could not verify this starting point. Check the spelling and try again.");
    } catch {
      if (!isCurrent()) return;
      setOriginError("Place checking is temporarily unavailable. Your spreadsheet remains in this browser.");
    }
  };

  const reset = () => {
    fileReadVersionRef.current += 1;
    setReading(false);
    inputVersionRef.current += 1;
    originRequestVersionRef.current += 1;
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
  const canConfirm = Boolean(proposal?.canConfirmStructure && resolvedOrigin && allPlacesResolved && !resolvingPlaces && !sessionPending && !accountSaveWarning && !reservedCreationHref);

  const confirm = async () => {
    if (!proposal || !resolvedOrigin || !reviewedInputKey || !canConfirm || saving || confirmingRef.current) return;
    const ownerId = visibleOwnerId;
    const sourceRevision = recoverySourceRevisionRef.current;
    const inputVersion = inputVersionRef.current;
    const version = ++confirmationVersionRef.current;
    const isCurrent = () => mountedRef.current && ownerScopeRef.current === ownerScope
      && reviewedInputKeyRef.current === reviewedInputKey && inputVersionRef.current === inputVersion
      && confirmationVersionRef.current === version;
    confirmingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const previous = pendingSubmissionRef.current;
      const recovery = previous ? await loadTripRecovery(previous.trip.id, ownerId) : null;
      if (!isCurrent()) return;
      if (recoverySourceRevisionRef.current !== sourceRevision) throw new Error("The device copy changed while it was being checked. Review it before retrying this import.");
      let pending = pendingSpreadsheetImportForRetry(previous, { reviewedInputKey, ownerId, recovery });
      if (!pending) {
        let fresh=creationSubmissionRef.current;
        if(!fresh||fresh.reviewedInputKey!==reviewedInputKey||fresh.ownerId!==ownerId) {
        const candidate = canonicalTripFromSpreadsheetProposal({
          id: `trip-${crypto.randomUUID()}`,
          proposal,
          origin: resolvedOrigin,
          places: proposal.stops.map((stop) => resolvedPlaces[stop.id]),
          recommendUnbookedTransfers: true,
        });
        const controller = new AbortController();
        transferRequestRef.current = controller;
        const trip = await assessSpreadsheetImportTransfers(candidate, controller.signal);
        if (!isCurrent()) return;
        if (recoverySourceRevisionRef.current !== sourceRevision) throw new Error("The device copy changed while this import was being prepared. Review it before retrying.");
        fresh={reviewedInputKey,ownerId,trip,token:createTripCreationToken(trip,ownerId,"spreadsheet-import",crypto.randomUUID())};
        creationSubmissionRef.current=fresh;
        }
        const {trip}=fresh;
        const preserved = await saveTripRecovery(trip, { ownerId, newTripOrClone: true, creation:fresh.token,onCreationAttempted:()=>{
          if(!isCurrent())return;
          const url=new URL(window.location.href);url.searchParams.set("creation",trip.id);url.searchParams.set("creationOperation",fresh!.token.operationId);
          window.history.replaceState(window.history.state,"",url);
        }, isCurrent, accountSavePending: Boolean(ownerId) });
        if (!isCurrent()) return;
        if (!preserved.stored) throw new Error(preserved.blockedByExistingRecovery
          ? "A different recovery copy already exists on this device. Open or resolve it before importing another trip."
          : "This browser could not preserve the reviewed trip. Keep this page open and try again when device storage is available.");
        if (!ownerId) {
          if (preserved.pointerAcknowledged === false) {
            setAccountSaveWarning({ tripId: trip.id, ownerId: null, accountAcknowledged: false, protectedRecovery: false, detail: "This trip is saved on the device. Opening it automatically could not be confirmed; use Open saved trip to continue." });
            return;
          }
          window.location.assign(firstTripWorkspaceHref(trip.id));
          return;
        }
        pending = { reviewedInputKey, ownerId, trip, handle: preserved.handle };
        pendingSubmissionRef.current = pending;
      }
      const outgoing = structuredClone(pending.trip);
      const saved = await saveTripRecoveryToEasyT(outgoing, pending.handle);
      const acknowledged = await acknowledgeTripBuildSave(outgoing, saved, pending.handle, { isCurrent });
      if (!isCurrent()) return;
      if (!acknowledged.accountAcknowledged) throw new Error("The account save did not confirm the trip you reviewed. The reviewed copy remains recoverable on this device.");
      pendingSubmissionRef.current = null;
      const protectedRecovery = acknowledged.outcome === "device-newer" || acknowledged.deviceOutcome === "protected-conflict";
      if (protectedRecovery || !acknowledged.cacheStored) {
        setAccountSaveWarning({ tripId: saved.id, ownerId: saved.ownerId!, accountAcknowledged: true, protectedRecovery, detail: protectedRecovery
          ? "Your account trip is saved. A separate device copy still needs review before you continue."
          : "Your account trip is saved. This browser could not update its device copy. Open the account trip to continue." });
        return;
      }
      window.location.assign(firstTripWorkspaceHref(saved.id));
    } catch (error) {
      if (!isCurrent()) return;
      setSaveError(error instanceof BrowserRecoveryReadError
        ? "The device copy could not be confirmed. Keep this page open and retry before importing another trip."
        : error instanceof Error ? error.message : "Morrovia could not save this trip. The reviewed information has not been silently changed.");
    } finally {
      if (confirmationVersionRef.current === version) confirmingRef.current = false;
      if (mountedRef.current && ownerScopeRef.current === ownerScope && confirmationVersionRef.current === version) setSaving(false);
    }
  };

  return <div className={styles.boundary}>
    {reservedCreationHref ? <MorroviaStatusBanner tone="warning" title="Your reviewed import is preserved" detail="Continue the interrupted creation before importing another trip." actions={<EasyTLinkButton href={reservedCreationHref}>Continue reviewed trip</EasyTLinkButton>} /> : null}
    {accountSaveWarning && accountSaveWarning.ownerId === visibleOwnerId ? <MorroviaStatusBanner tone="warning" title={accountSaveWarning.accountAcknowledged ? "Saved to your account" : "Saved on this device"} detail={accountSaveWarning.detail} actions={<EasyTLinkButton href={accountSaveWarning.protectedRecovery ? tripSyncRecoveryPath(accountSaveWarning.tripId) : firstTripWorkspaceHref(accountSaveWarning.tripId)}>{accountSaveWarning.protectedRecovery ? "Review device copy" : "Open saved trip"}</EasyTLinkButton>} /> : null}
    <Link className={styles.back} href="/journey/new"><ArrowLeft aria-hidden="true" /> Back to trip creation</Link>
    {!table ? <header className={styles.hero}>
      <p>IMPORT EXISTING TRIP</p>
      <h1>Bring your trip into Morrovia.</h1>
    </header> : null}

    {!table ? <section className={styles.inputPanel} aria-labelledby="import-source-title">
      <div className={styles.sectionHeading}>
        <div><span>STEP 1</span><h2 id="import-source-title">Choose your source</h2><p>CSV, XLSX, or a copied spreadsheet table.</p></div>
        <FileSpreadsheet aria-hidden="true" />
      </div>
      <p className={styles.confirmationNote}>Review and confirm before creating a trip.</p>
      <EasyTSegmentedControl ariaLabel="Import source" value={inputMode} onChange={changeInputMode} options={[{ value: "file", label: "Upload file", controls: "import-file" }, { value: "paste", label: "Paste table", controls: "import-paste" }]} />
      {inputMode === "file" ? <div id="import-file" className={styles.filePanel}>
        <Upload aria-hidden="true" />
        <div><strong>Choose a CSV or XLSX file</strong><span>Up to 5 MB, 1,000 rows and 60 columns. XLS, XLSM and merged multi-sheet imports are not supported.</span></div>
        <label className={styles.fileAction}>
          <span>{reading ? "Reading…" : "Choose file"}</span>
          <input type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={reading} onChange={readFile} />
        </label>
      </div> : <div id="import-paste" className={styles.pastePanel}>
        <EasyTTextArea label="Spreadsheet rows" value={pasteValue} onChange={(event) => editPastedSource(event.target.value)} rows={9} placeholder={"Destination\tArrival date\tDeparture date\nTokyo\t2027-04-02\t2027-04-06"} hint="Include the header row. Tabs, commas and semicolons are supported." />
        <EasyTButton icon={FileSpreadsheet} onClick={parsePaste} disabled={!pasteValue.trim()}>Review pasted table</EasyTButton>
      </div>}
      {inputError ? <MorroviaRecoveryFeedback title="We could not read that source" detail={inputError} safety="No trip was created and the original file was not stored." /> : null}
      <MorroviaStatusBanner tone="info" title="Parsed privately in this browser" detail="Morrovia does not upload the original file, execute formulas or macros, fetch spreadsheet links, or send rows to an AI service." />
    </section> : <>
      {sheets.length > 1 ? <section className={styles.sheetChoice}>
        <MorroviaStatusBanner tone="warning" title={`${sheets.length} plausible worksheets found`} detail="Choose one worksheet. Morrovia does not merge unrelated sheets in V1." />
        <EasyTSelect label="Worksheet" value={String(sheetIndex)} onChange={(event) => chooseSheet(Number(event.target.value))}>{sheets.map((sheet, index) => <option value={index} key={sheet.name}>{sheet.name} · {sheet.rows.length} rows</option>)}</EasyTSelect>
      </section> : null}
      {proposal ? <SpreadsheetImportReview key={JSON.stringify([ownerScope, proposal])}
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
        onOriginValueChange={(value) => { inputVersionRef.current += 1; originRequestVersionRef.current += 1; setOriginValue(value); setResolvedOrigin(null); setOriginOptions([]); setOriginError(""); }}
        onResolveOrigin={() => void resolveOrigin()}
        onSelectOrigin={(option) => { if (!mountedRef.current || ownerScopeRef.current !== ownerScope || proposalRef.current !== proposal) return; const accepted = acceptImportPlace(option, "endpoint"); if (!accepted) return; inputVersionRef.current += 1; originRequestVersionRef.current += 1; setResolvedOrigin(accepted); setOriginValue(accepted.name); setOriginError(""); }}
        onSelectPlace={(stopId, option) => { if (!mountedRef.current || ownerScopeRef.current !== ownerScope || proposalRef.current !== proposal) return; inputVersionRef.current += 1; setResolvedPlaces((current) => ({ ...current, [stopId]: placeFromCandidate(stopId, option) })); }}
        onConfirm={() => void confirm()}
      /> : null}
    </>}
  </div>;
}
