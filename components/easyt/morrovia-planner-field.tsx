import { ChevronDown, type LucideIcon } from "lucide-react";
import styles from "./morrovia-planner-field.module.css";

/** Presentation shared by planner field triggers; callers retain interaction and focus ownership. */
export function MorroviaPlannerFieldContent({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return <span className={styles.content}>
    <Icon className={styles.icon} data-morrovia-field-icon aria-hidden="true" />
    <span className={styles.label} data-morrovia-field-label>{label}</span>
    <span className={styles.value} data-morrovia-field-secondary>{value}</span>
    <ChevronDown className={styles.chevron} aria-hidden="true" />
  </span>;
}

export const plannerFieldButtonClassName = styles.button;
