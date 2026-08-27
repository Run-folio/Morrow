"use client";

import { Minus, Plus, UsersRound } from "lucide-react";
import { useId, type KeyboardEvent } from "react";
import styles from "./morrovia-quantity-selector.module.css";

export function MorroviaQuantitySelector({
  className = "",
  compact = false,
  disabled = false,
  label,
  locale = "en",
  max = 12,
  min = 1,
  noun = "traveller",
  nounPlural = "travellers",
  onChange,
  showIcon = true,
  value,
}: {
  className?: string;
  compact?: boolean;
  disabled?: boolean;
  label: string;
  locale?: "en" | "es";
  max?: number;
  min?: number;
  noun?: string;
  nounPlural?: string;
  onChange: (value: number) => void;
  showIcon?: boolean;
  value: number;
}) {
  const labelId = useId();
  const boundedValue = Math.max(min, Math.min(max, value));
  const valueLabel = `${boundedValue} ${boundedValue === 1 ? noun : nounPlural}`;
  const decreaseLabel = locale === "es" ? `Reducir ${nounPlural}; actualmente ${valueLabel}` : `Decrease ${nounPlural}; ${valueLabel} currently`;
  const increaseLabel = locale === "es" ? `Aumentar ${nounPlural}; actualmente ${valueLabel}` : `Increase ${nounPlural}; ${valueLabel} currently`;
  const update = (next: number) => {
    if (disabled) return;
    onChange(Math.max(min, Math.min(max, next)));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      update(boundedValue - 1);
    }
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      update(boundedValue + 1);
    }
    if (event.key === "Home") {
      event.preventDefault();
      update(min);
    }
    if (event.key === "End") {
      event.preventDefault();
      update(max);
    }
  };

  return <div className={`${styles.root} ${compact ? styles.compact : ""} ${className}`}>
    <span className={styles.label} id={labelId}>{label}</span>
    <div className={styles.stepper} role="group" aria-labelledby={labelId} onKeyDown={onKeyDown}>
      <button type="button" disabled={disabled || boundedValue <= min} onClick={() => update(boundedValue - 1)} aria-label={decreaseLabel}><Minus aria-hidden="true" /></button>
      <output className={styles.value} aria-live="polite" aria-atomic="true">
        {showIcon ? <UsersRound aria-hidden="true" /> : null}<strong>{boundedValue}</strong><span>{boundedValue === 1 ? noun : nounPlural}</span>
      </output>
      <button type="button" disabled={disabled || boundedValue >= max} onClick={() => update(boundedValue + 1)} aria-label={increaseLabel}><Plus aria-hidden="true" /></button>
    </div>
  </div>;
}
