import type { ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import styles from "./morrovia-planner-field.module.css";

/** Presentation shared by planner field triggers; callers retain interaction and focus ownership. */
export function MorroviaPlannerFieldContent({ label, value, icon: Icon, labelId, showChevron = true }: { label?: string; value: ReactNode; icon: LucideIcon; labelId?: string; showChevron?: boolean }) {
  return <span className={styles.content} data-unlabelled={!label || undefined}>
    <Icon className={styles.icon} data-morrovia-field-icon aria-hidden="true" />
    {label ? <span id={labelId} className={styles.label} data-morrovia-field-label>{label}</span> : null}
    <span className={styles.value} data-morrovia-field-secondary>{value}</span>
    {showChevron ? <ChevronDown className={styles.chevron} aria-hidden="true" /> : null}
  </span>;
}

export const plannerFieldButtonClassName = styles.button;
