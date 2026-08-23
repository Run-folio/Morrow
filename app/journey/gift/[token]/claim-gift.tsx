"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Gift } from "lucide-react";
import { tripWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import styles from "../../account.module.css";

export default function ClaimGift({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState("");

  const claim = async () => {
    setState("working");
    setError("");
    const response = await fetch(`/api/easyt/gifts/${encodeURIComponent(token)}`, {
      method: "POST",
    });
    const payload = (await response.json()) as { trip?: { id: string }; error?: string };
    if (!response.ok || !payload.trip) {
      setState("idle");
      setError(payload.error || "Unable to claim this trip.");
      return;
    }
    setState("done");
    router.push(tripWorkspaceHref(payload.trip.id));
  };

  return (
    <div className={styles.giftClaimActions}>
      {error ? <p className={styles.syncError}>{error}</p> : null}
      <button type="button" className={styles.primaryLink} onClick={claim} disabled={state !== "idle"}>
        {state === "done" ? <Check aria-hidden="true" /> : <Gift aria-hidden="true" />}
        {state === "working" ? "Adding to your trips…" : "Claim editable copy"}
        {state === "idle" ? <ArrowRight aria-hidden="true" /> : null}
      </button>
    </div>
  );
}
