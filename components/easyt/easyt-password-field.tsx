"use client";

import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";

import { EasyTButton } from "./easyt-controls";
import styles from "./easyt-controls.module.css";

export const EasyTPasswordField = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
    fieldClassName?: string;
    label: string;
    labelClassName?: string;
    hint?: string;
    error?: string;
  }
>(function EasyTPasswordField({ className = "", fieldClassName = "", label, labelClassName = "", hint, error, id: suppliedId, ...props }, ref) {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  const descriptionId = error || hint ? `${id}-description` : undefined;
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? "Hide password" : "Show password";
  const ToggleIcon = visible ? EyeOff : Eye;

  return (
    <div className={`${styles.field} ${error ? styles.fieldInvalid : ""} ${props.disabled ? styles.fieldDisabled : ""} ${fieldClassName}`}>
      <label className={`${styles.fieldLabel} ${labelClassName}`} htmlFor={id}>
        {label}{props.required ? <b aria-hidden="true"> *</b> : null}
      </label>
      <span className={styles.passwordWrap}>
        {/* morrovia-ui-audit-allow-next-line native-control -- This shared composite field owns the native password input required to preserve one value while its adjacent visibility control changes the input type. */}
        <input
          {...props}
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          className={`${styles.fieldControl} ${styles.passwordInput} ${className}`}
          aria-invalid={Boolean(error)}
          aria-describedby={descriptionId}
        />
        <EasyTButton
          className={styles.passwordToggle}
          type="button"
          variant="quiet"
          size="small"
          icon={ToggleIcon}
          iconOnly
          aria-label={toggleLabel}
          aria-pressed={visible}
          disabled={props.disabled}
          onClick={() => setVisible((current) => !current)}
        >
          {toggleLabel}
        </EasyTButton>
      </span>
      {error ? (
        <p className={styles.fieldError} id={descriptionId} role="alert">{error}</p>
      ) : hint ? (
        <p className={styles.fieldHint} id={descriptionId}>{hint}</p>
      ) : null}
    </div>
  );
});
