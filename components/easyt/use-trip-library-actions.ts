"use client";

import {useEffect, useRef, useState} from "react";
import type {EasyTTrip} from "@/lib/easyt/trip";
import type {EasyTLanguage} from "@/lib/easyt/i18n";
import type {OwnerBoundaryState} from "@/lib/easyt/private-browser-context";
import {reconcileTripCloudMutation} from "@/lib/easyt/storage";
import {runClientMutation} from "@/lib/easyt/client-mutation";
import {tripDisplayTitle} from "@/lib/easyt/trip-display";

type Options = {
  ownerId: string;
  ownerScope: string;
  boundary: OwnerBoundaryState;
  language: EasyTLanguage;
  refresh: () => void;
  beforeAction?: () => boolean | Promise<boolean>;
  onDelete?: () => void;
};

/** Existing Trips lifecycle and gift flow, shared with the Overview menu. */
export function useTripLibraryActions({ownerId,ownerScope,boundary,language,refresh,beforeAction,onDelete}: Options) {
  const [working, setWorking] = useState<string | null>(null);
  const [workingAction, setWorkingAction] = useState<"archive" | "restore" | "duplicate" | "delete" | null>(null);
  const actionInFlightRef = useRef<object | null>(null);
  const [actionError, setActionError] = useState("");
  const [failedAction, setFailedAction] = useState<{ id: string; action: "archive" | "restore" | "duplicate" } | null>(null);
  const [actionNotice, setActionNotice] = useState<{ title: string; detail: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EasyTTrip | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [gifting, setGifting] = useState<EasyTTrip | null>(null);
  const [giftEmail, setGiftEmail] = useState("");
  const [giftNote, setGiftNote] = useState("");
  const [giftState, setGiftState] = useState<"idle" | "sending" | "complete">("idle");
  const [giftError, setGiftError] = useState("");
  const [claimUrl, setClaimUrl] = useState("");
  const giftRequestRef = useRef<{ signature: string; key: string } | null>(null);
  const [delivered, setDelivered] = useState(false);
  const mountedRef = useRef(true);
  const scopeRef = useRef({identity: ownerScope});
  if (scopeRef.current.identity !== ownerScope) { scopeRef.current = {identity: ownerScope}; actionInFlightRef.current = null; }
  const renderScope = scopeRef.current;
  const mountGenerationRef = useRef(0);
  const [stateScope, setStateScope] = useState(renderScope);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; mountGenerationRef.current += 1; }; }, []);
  const canStart = () => mountedRef.current && scopeRef.current === renderScope && Boolean(ownerId) && boundary === "current" && !actionInFlightRef.current;
  const beginCurrentState = () => {
    if (stateScope !== renderScope) {
      // Hiding retired state is insufficient: a new action must not retag an
      // old owner's sibling dialog, recipient, claim URL or success notice.
      setWorking(null); setWorkingAction(null); setActionError(""); setFailedAction(null); setActionNotice(null);
      setPendingDelete(null); setDeleteError(""); setGifting(null); setGiftEmail(""); setGiftNote("");
      setGiftState("idle"); setGiftError(""); setClaimUrl(""); setDelivered(false); giftRequestRef.current = null;
    }
    setStateScope(renderScope);
  };
  const requestDelete = (trip: EasyTTrip) => {
    if (!canStart() || trip.ownerId !== ownerId) return;
    beginCurrentState(); setDeleteError(""); setPendingDelete(trip);
  };

  const runAction = async (id: string, action: "archive" | "restore" | "duplicate") => {
    if (!canStart()) return;
    const actionScope = renderScope, mountGeneration = mountGenerationRef.current;
    const isCurrent = () => mountedRef.current && scopeRef.current === actionScope && mountGenerationRef.current === mountGeneration;
    const operation = {}; actionInFlightRef.current = operation;
    beginCurrentState();
    setWorking(id);
    setWorkingAction(action);
    setActionError("");
    setFailedAction(null);
    try {
      const permission = beforeAction?.();
      if (permission !== undefined && permission !== true && await permission !== true) { if (isCurrent()) setActionError("Finish saving this trip before changing its account copy."); return; }
      if (!isCurrent()) return;
      const result = await runClientMutation(() => fetch(`/api/easyt/trips/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      }));
      if (!isCurrent()) return;
      if (result.kind === "network") {
        setActionError("This trip could not be updated. Check your connection and try again.");
        setFailedAction({ id, action });
        return;
      }
      const response = result.value;
      if (response.ok) {
        const payload = await response.json() as { trip?: EasyTTrip };
        if (!isCurrent()) return;
        if (!payload.trip || payload.trip.ownerId !== ownerId || (action !== "duplicate" && payload.trip.id !== id)) {
          setActionError("The account response did not confirm this trip update. Refresh your trips before trying again.");
          return;
        }
        if ((action === "archive" || action === "restore") && payload.trip) {
          await reconcileTripCloudMutation(ownerId, id, action, payload.trip);
          if (!isCurrent()) return;
          setActionNotice({
            title: action === "archive"
              ? (language === "es" ? "Viaje archivado" : "Trip archived")
              : (language === "es" ? "Viaje restaurado" : "Trip restored"),
            detail: action === "archive"
              ? (language === "es"
                ? `“${tripDisplayTitle(payload.trip)}” está ahora en Viajes archivados.`
                : `“${tripDisplayTitle(payload.trip)}” is now in Archived trips.`)
              : (language === "es"
                ? `“${tripDisplayTitle(payload.trip)}” está ahora en Viajes activos.`
                : `“${tripDisplayTitle(payload.trip)}” is now in Active trips.`),
          });
        }
        if (action === "duplicate" && payload.trip) {
          setActionNotice({
            title: language === "es" ? "Viaje duplicado" : "Trip duplicated",
            detail: language === "es"
              ? `“${tripDisplayTitle(payload.trip)}” está ahora en Viajes activos.`
              : `“${tripDisplayTitle(payload.trip)}” is now in Active trips.`,
          });
        }
        refresh();
      }
      else {
        setActionError(response.status === 401 ? "Your session ended. Sign in again before changing this trip." : "This trip could not be updated. Please try again.");
        if (response.status !== 401) setFailedAction({ id, action });
      }
    } catch {
      if (!isCurrent()) return;
      setActionError("This trip could not be updated. Check your connection and try again.");
      setFailedAction({ id, action });
    } finally {
      if (actionInFlightRef.current === operation) actionInFlightRef.current = null;
      if (isCurrent()) { setWorking(null); setWorkingAction(null); }
    }
  };

  const remove = async (trip: EasyTTrip) => {
    if (!canStart() || stateScope !== renderScope || pendingDelete?.id !== trip.id || pendingDelete.ownerId !== ownerId) return;
    const actionScope = renderScope, mountGeneration = mountGenerationRef.current;
    const isCurrent = () => mountedRef.current && scopeRef.current === actionScope && mountGenerationRef.current === mountGeneration;
    const operation = {}; actionInFlightRef.current = operation;
    beginCurrentState();
    setWorking(trip.id);
    setWorkingAction("delete");
    setDeleteError("");
    try {
      if (trip.ownerId !== ownerId) return;
      const permission = beforeAction?.();
      if (permission !== undefined && permission !== true && await permission !== true) { if (isCurrent()) setDeleteError("Finish saving this trip before deleting its account copy."); return; }
      if (!isCurrent()) return;
      const response = await fetch(`/api/easyt/trips/${encodeURIComponent(trip.id)}`, { method: "DELETE" });
      if (!isCurrent()) return;
      if (response.ok) {
        await reconcileTripCloudMutation(ownerId, trip.id, "delete");
        if (!isCurrent()) return;
        setPendingDelete(null);
        setActionNotice({
          title: language === "es" ? "Viaje eliminado" : "Trip deleted",
          detail: language === "es"
            ? `“${tripDisplayTitle(trip)}” se eliminó de tu cuenta.`
            : `“${tripDisplayTitle(trip)}” was removed from your account.`,
        });
        if (onDelete) onDelete(); else refresh();
      }
      else setDeleteError(response.status === 401 ? "Your session ended. Sign in again before deleting this trip." : "This trip could not be deleted. Please try again.");
    } catch {
      if (!isCurrent()) return;
      setDeleteError("This trip could not be deleted. Check your connection and try again.");
    } finally {
      if (actionInFlightRef.current === operation) actionInFlightRef.current = null;
      if (isCurrent()) { setWorking(null); setWorkingAction(null); }
    }
  };

  const openGift = (trip: EasyTTrip) => {
    if (!canStart() || trip.ownerId !== ownerId) return;
    beginCurrentState();
    setGifting(trip);
    setGiftEmail("");
    setGiftNote("");
    setGiftState("idle");
    setGiftError("");
    setClaimUrl("");
    giftRequestRef.current = null;
  };

  const sendGift = async () => {
    if (!gifting || gifting.ownerId !== ownerId || stateScope !== renderScope || !canStart()) return;
    const actionScope = renderScope, mountGeneration = mountGenerationRef.current;
    const isCurrent = () => mountedRef.current && scopeRef.current === actionScope && mountGenerationRef.current === mountGeneration;
    const operation = {}; actionInFlightRef.current = operation;
    setWorking(gifting.id);
    setGiftState("sending");
    setGiftError("");
    try {
      const permission = beforeAction?.();
      if (permission !== undefined && permission !== true && await permission !== true) { if (isCurrent()) setGiftError("Finish saving this trip before sharing its account copy."); return; }
      if (!isCurrent()) return;
      const signature = JSON.stringify([gifting.id, giftEmail.trim().toLowerCase(), giftNote.trim()]);
      if (giftRequestRef.current?.signature !== signature) {
        giftRequestRef.current = { signature, key: crypto.randomUUID() };
      }
      const response = await fetch(`/api/easyt/trips/${encodeURIComponent(gifting.id)}/gift`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": giftRequestRef.current.key,
        },
        body: JSON.stringify({ email: giftEmail, note: giftNote }),
      });
      const payload = (await response.json()) as { error?: string; claimUrl?: string; delivered?: boolean };
      if (!isCurrent()) return;
      if (!response.ok || !payload.claimUrl) {
        setGiftError(response.status === 401 ? "Your session ended. Sign in again before sharing this trip." : payload.error || (language === "es" ? "No se pudo crear la invitación." : "Unable to create invitation."));
        return;
      }
      setClaimUrl(payload.claimUrl);
      setDelivered(Boolean(payload.delivered));
      setGiftState("complete");
    } catch {
      if (!isCurrent()) return;
      setGiftError(language === "es" ? "Revisa tu conexión e inténtalo de nuevo." : "Check your connection and try again.");
    } finally {
      if (actionInFlightRef.current === operation) actionInFlightRef.current = null;
      if (isCurrent()) { setWorking(null); setGiftState((current) => current === "complete" ? current : "idle"); }
    }
  };

  const visible = stateScope === renderScope && boundary === "current" && Boolean(ownerId);
  return {
    working: visible ? working : null, workingAction: visible ? workingAction : null,
    actionError: visible ? actionError : "", failedAction: visible ? failedAction : null,
    actionNotice: visible ? actionNotice : null, setActionNotice,
    pendingDelete: visible ? pendingDelete : null, setPendingDelete,
    deleteError: visible ? deleteError : "", setDeleteError, requestDelete,
    gifting: visible ? gifting : null, setGifting, giftEmail, setGiftEmail, giftNote, setGiftNote,
    giftState, giftError, claimUrl: visible ? claimUrl : "", delivered,
    runAction, remove, openGift, sendGift,
  };
}
export type TripLibraryActions = ReturnType<typeof useTripLibraryActions>;
