import Link from "next/link";
import { ChevronDown, type LucideIcon } from "lucide-react";
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import styles from "./easyt-controls.module.css";

type ControlVariant = "primary" | "secondary" | "quiet" | "danger";
type ControlSize = "small" | "medium" | "large";

type SharedControlProps = {
  children: ReactNode;
  className?: string;
  icon?: LucideIcon;
  iconOnly?: boolean;
  loading?: boolean;
  size?: ControlSize;
  variant?: ControlVariant;
  fullWidth?: boolean;
};

function controlClassName({
  className = "",
  iconOnly,
  size = "medium",
  variant = "primary",
  fullWidth,
}: Omit<SharedControlProps, "children" | "icon" | "loading">) {
  return [
    styles.control,
    styles[variant],
    size !== "medium" ? styles[size] : "",
    iconOnly ? styles.iconOnly : "",
    fullWidth ? styles.fullWidth : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export const EasyTButton = forwardRef<
  HTMLButtonElement,
  SharedControlProps & ButtonHTMLAttributes<HTMLButtonElement>
>(function EasyTButton(
  {
    children,
    className,
    disabled,
    icon: Icon,
    iconOnly,
    loading,
    size,
    variant,
    fullWidth,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={controlClassName({ className, iconOnly, size, variant, fullWidth })}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : Icon ? <Icon aria-hidden="true" /> : null}
      {iconOnly ? <span className="sr-only">{children}</span> : children}
    </button>
  );
});

export function EasyTLinkButton({
  href,
  children,
  className,
  icon: Icon,
  iconOnly,
  size,
  variant,
  fullWidth,
  onClick,
}: SharedControlProps & { href: string; onClick?: MouseEventHandler<HTMLAnchorElement> }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={controlClassName({ className, iconOnly, size, variant, fullWidth })}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      {iconOnly ? <span className="sr-only">{children}</span> : children}
    </Link>
  );
}

type FieldShellProps = {
  children: ReactNode;
  disabled?: boolean;
  error?: string;
  hint?: string;
  id: string;
  label: string;
  optional?: boolean;
  required?: boolean;
};

function FieldShell({ children, disabled, error, hint, id, label, optional, required }: FieldShellProps) {
  const descriptionId = error || hint ? `${id}-description` : undefined;
  return (
    <label className={`${styles.field} ${error ? styles.fieldInvalid : ""} ${disabled ? styles.fieldDisabled : ""}`} htmlFor={id}>
      <span className={styles.fieldLabel}>{label}{required ? <b aria-hidden="true"> *</b> : optional ? <small>Optional</small> : null}</span>
      {children}
      {error ? (
        <p className={styles.fieldError} id={descriptionId} role="alert">{error}</p>
      ) : hint ? (
        <p className={styles.fieldHint} id={descriptionId}>{hint}</p>
      ) : null}
    </label>
  );
}

export const EasyTField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    hint?: string;
    error?: string;
    optional?: boolean;
  }
>(function EasyTField({ label, hint, error, optional, id: suppliedId, ...props }, ref) {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} required={props.required} disabled={props.disabled}>
      <input
        {...props}
        ref={ref}
        id={id}
        className={styles.fieldControl}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${id}-description` : undefined}
      />
    </FieldShell>
  );
});

export const EasyTSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & {
    label: string;
    hint?: string;
    error?: string;
    optional?: boolean;
  }
>(function EasyTSelect({ label, hint, error, optional, id: suppliedId, children, ...props }, ref) {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} required={props.required} disabled={props.disabled}>
      <span className={styles.selectWrap}>
        <select
          {...props}
          ref={ref}
          id={id}
          className={styles.fieldControl}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? `${id}-description` : undefined}
        >
          {children}
        </select>
        <ChevronDown className={styles.selectIcon} aria-hidden="true" />
      </span>
    </FieldShell>
  );
});

export const EasyTTextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    label: string;
    hint?: string;
    error?: string;
    optional?: boolean;
  }
>(function EasyTTextArea({ label, hint, error, optional, id: suppliedId, ...props }, ref) {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} required={props.required} disabled={props.disabled}>
      <textarea
        {...props}
        ref={ref}
        id={id}
        className={`${styles.fieldControl} ${styles.textArea}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${id}-description` : undefined}
      />
    </FieldShell>
  );
});

export type EasyTSegmentOption<T extends string> = {
  label: string;
  value: T;
  count?: number;
};

export function EasyTSegmentedControl<T extends string>({
  ariaLabel,
  className = "",
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  className?: string;
  onChange: (value: T) => void;
  options: EasyTSegmentOption<T>[];
  value: T;
}) {
  return (
    <div className={`${styles.segments} ${className}`} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={`${styles.segment} ${active ? styles.segmentActive : ""}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.count !== undefined ? <span className={styles.segmentCount}>{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
