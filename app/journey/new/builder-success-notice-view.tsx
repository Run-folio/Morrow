"use client";

import { MorroviaBriefNotice } from "@/components/easyt/morrovia-feedback";
import styles from "./trip-builder.module.css";

/** Success-only surface; structural Undo keeps its separate, actionable lifetime. */
export function BuilderSuccessNotice({ title }: { title: string | null }) {
  return <>
    <div data-builder-success-announcement className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {title}
    </div>
    {title ? <div className={`${styles.builderUndoToast} ${styles.builderSuccessToast}`} aria-hidden="true" data-builder-success-toast>
      <MorroviaBriefNotice variant="toast" title={title} />
    </div> : null}
  </>;
}
