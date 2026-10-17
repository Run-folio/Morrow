"use client";

import {Gift, X} from "lucide-react";
import {EasyTButton, EasyTField, EasyTTextArea} from "./easyt-controls";
import {MorroviaConfirmationDialog} from "./morrovia-feedback";
import {easytCopy, type EasyTLanguage} from "@/lib/easyt/i18n";
import {tripDisplayTitle} from "@/lib/easyt/trip-display";
import type {TripLibraryActions} from "./use-trip-library-actions";
import {useWorkspaceOrientationBlocker} from "./workspace-orientation";
import accountStyles from "@/app/journey/account.module.css";

export function TripLibraryActionDialogs({actions,language}:{actions:TripLibraryActions;language:EasyTLanguage}) {
  const {gifting,setGifting,giftState,delivered,claimUrl,giftEmail,setGiftEmail,giftNote,setGiftNote,giftError,sendGift,pendingDelete,working,deleteError,setPendingDelete,setDeleteError,remove}=actions;
  const copy=easytCopy[language].dashboard,isSpanish=language==="es";
  useWorkspaceOrientationBlocker(Boolean(gifting || pendingDelete));
  return <>
      {gifting ? (
        <div className={accountStyles.giftOverlay} role="presentation" onMouseDown={() => setGifting(null)}>
          <section className={accountStyles.giftDialog} role="dialog" aria-modal="true" aria-labelledby="gift-title" onMouseDown={(event) => event.stopPropagation()}>
            <EasyTButton className={accountStyles.giftClose} icon={X} iconOnly size="small" variant="secondary" onClick={() => setGifting(null)} aria-label={isSpanish ? "Cerrar diálogo" : "Close gift dialog"}>{isSpanish ? "Cerrar diálogo" : "Close gift dialog"}</EasyTButton>
            <span className={accountStyles.giftDialogIcon}><Gift aria-hidden="true" /></span>
            <p className={accountStyles.eyebrow}>{copy.giftTitle}</p>
            <h2 id="gift-title">{isSpanish ? "Compartir" : "Share"} {tripDisplayTitle(gifting)}</h2>
            {giftState === "complete" ? (
              <div className={accountStyles.giftComplete}>
                <p>{delivered ? copy.inviteSent : copy.inviteReady}</p>
                <EasyTField value={claimUrl} readOnly label={isSpanish ? "Enlace para reclamar" : "Gift claim link"} labelClassName="sr-only" />
                <EasyTButton className={accountStyles.primaryLink} onClick={() => navigator.clipboard.writeText(claimUrl)}>{copy.copyLink}</EasyTButton>
              </div>
            ) : (
              <>
                <p className={accountStyles.muted}>{copy.draftHint}</p>
                <EasyTField fieldClassName={accountStyles.field} label={copy.recipient} type="email" value={giftEmail} onChange={(event) => setGiftEmail(event.target.value)} placeholder="friend@example.com" autoComplete="email" />
                <EasyTTextArea fieldClassName={accountStyles.field} label={copy.note} value={giftNote} onChange={(event) => setGiftNote(event.target.value)} placeholder={isSpanish ? "Un pequeño adelanto para nuestra próxima aventura…" : "A little head start for our next adventure…"} maxLength={500} />
                {giftError ? <p className={accountStyles.syncError}>{giftError}</p> : null}
                <EasyTButton className={accountStyles.primaryLink} loading={giftState === "sending"} onClick={sendGift}>{giftState === "sending" ? copy.creatingInvite : copy.createInvite}</EasyTButton>
              </>
            )}
          </section>
        </div>
      ) : null}
      <MorroviaConfirmationDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete ? `${isSpanish ? "¿Eliminar" : "Delete"} “${tripDisplayTitle(pendingDelete)}”?` : "Delete trip?"}
        detail={isSpanish ? "Este viaje se eliminará de tu cuenta." : "This trip will be removed from your account."}
        consequences={isSpanish
          ? ["El plan, las notas y los datos guardados de este viaje dejarán de estar disponibles.", "Esta acción no se puede deshacer desde Morrovia."]
          : ["The plan, notes and saved trip data will no longer be available.", "This action cannot be undone in Morrovia."]}
        cancelLabel={isSpanish ? "Conservar viaje" : "Keep trip"}
        confirmLabel={isSpanish ? "Eliminar viaje" : "Delete trip"}
        confirming={Boolean(pendingDelete && working === pendingDelete.id)}
        error={deleteError || undefined}
        onCancel={() => { if (!working) { setPendingDelete(null); setDeleteError(""); } }}
        onConfirm={() => { if (pendingDelete) void remove(pendingDelete); }}
      />
  </>;
}
