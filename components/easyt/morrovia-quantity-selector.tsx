"use client";
import { MotionButton } from "@/components/easyt/app-motion";

import { Minus, Plus, UsersRound } from "lucide-react";
import { useId, type KeyboardEvent } from "react";
import { EasyTSelect } from "./easyt-controls";
import { MorroviaPlannerFieldContent, plannerFieldButtonClassName } from "./morrovia-planner-field";
import styles from "./morrovia-quantity-selector.module.css";

export function MorroviaQuantitySelector({
  className = "",
  compact = false,
  fieldPresentation,
  plannerDropdown = false,
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
  fieldPresentation?: "planner";
  plannerDropdown?: boolean;
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

  if (fieldPresentation === "planner" && plannerDropdown) return <EasyTSelect
    label={label} fieldClassName={className} disabled={disabled} value={boundedValue}
    plannerPresentation={{ icon: UsersRound, valueLabel, valueOnly: true }}
    onChange={(event) => update(Number(event.currentTarget.value))}
  >
    {Array.from({ length: max - min + 1 }, (_, index) => {
      const quantity = min + index;
      return <option key={quantity} value={quantity}>{quantity} {quantity === 1 ? noun : nounPlural}</option>;
    })}
  </EasyTSelect>;

  if (fieldPresentation === "planner") return <div className={`${plannerFieldButtonClassName} ${styles.planner} ${className}`} data-disabled={disabled || undefined}>
    <div className={styles.plannerStepper} role="group" aria-labelledby={labelId} onKeyDown={onKeyDown}>
      <MorroviaPlannerFieldContent label={label} labelId={labelId} value={<output aria-live="polite" aria-atomic="true">{valueLabel}</output>} icon={UsersRound} showChevron={false} />
      <MotionButton type="button" disabled={disabled || boundedValue <= min} onClick={() => update(boundedValue - 1)} aria-label={decreaseLabel}><Minus aria-hidden="true" /></MotionButton>
      <MotionButton type="button" disabled={disabled || boundedValue >= max} onClick={() => update(boundedValue + 1)} aria-label={increaseLabel}><Plus aria-hidden="true" /></MotionButton>
    </div>
  </div>;

  return <div className={`${styles.root} ${compact ? styles.compact : ""} ${className}`}>
    <span data-morrovia-field-label className={styles.label} id={labelId}>{label}</span>
    <div className={styles.stepper} role="group" aria-labelledby={labelId} onKeyDown={onKeyDown}>
      <MotionButton type="button" disabled={disabled || boundedValue <= min} onClick={() => update(boundedValue - 1)} aria-label={decreaseLabel}><Minus aria-hidden="true" /></MotionButton>
      <output data-morrovia-field-value className={styles.value} aria-live="polite" aria-atomic="true">
        {showIcon ? <UsersRound aria-hidden="true" /> : null}<strong>{boundedValue}</strong><span>{boundedValue === 1 ? noun : nounPlural}</span>
      </output>
      <MotionButton type="button" disabled={disabled || boundedValue >= max} onClick={() => update(boundedValue + 1)} aria-label={increaseLabel}><Plus aria-hidden="true" /></MotionButton>
    </div>
  </div>;
}
