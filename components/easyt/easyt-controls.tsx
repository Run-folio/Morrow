import Link from "next/link";
import { ChevronDown, type LucideIcon } from "lucide-react";
import {
  forwardRef,
  useId,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
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
  ...props
}: SharedControlProps & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "className" | "href">) {
  return (
    <Link
      {...props}
      href={href}
      className={controlClassName({ className, iconOnly, size, variant, fullWidth })}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      {iconOnly ? <span className="sr-only">{children}</span> : children}
    </Link>
  );
}

type FieldShellProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  error?: string;
  hint?: string;
  id: string;
  label: string;
  labelClassName?: string;
  optional?: boolean;
  required?: boolean;
};

function FieldShell({ children, className = "", disabled, error, hint, id, label, labelClassName = "", optional, required }: FieldShellProps) {
  const descriptionId = error || hint ? `${id}-description` : undefined;
  return (
    <label className={`${styles.field} ${error ? styles.fieldInvalid : ""} ${disabled ? styles.fieldDisabled : ""} ${className}`} htmlFor={id}>
      <span className={`${styles.fieldLabel} ${labelClassName}`}>{label}{required ? <b aria-hidden="true"> *</b> : optional ? <small>Optional</small> : null}</span>
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
    fieldClassName?: string;
    label: string;
    labelClassName?: string;
    hint?: string;
    error?: string;
    optional?: boolean;
  }
>(function EasyTField({ className = "", fieldClassName, label, labelClassName, hint, error, optional, id: suppliedId, ...props }, ref) {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  return (
    <FieldShell className={fieldClassName} id={id} label={label} labelClassName={labelClassName} hint={hint} error={error} optional={optional} required={props.required} disabled={props.disabled}>
      <input
        {...props}
        ref={ref}
        id={id}
        className={`${styles.fieldControl} ${className}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${id}-description` : undefined}
      />
    </FieldShell>
  );
});

export const EasyTSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & {
    fieldClassName?: string;
    label: string;
    labelClassName?: string;
    hint?: string;
    error?: string;
    optional?: boolean;
  }
>(function EasyTSelect({ className = "", fieldClassName, label, labelClassName, hint, error, optional, id: suppliedId, children, ...props }, ref) {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  return (
    <FieldShell className={fieldClassName} id={id} label={label} labelClassName={labelClassName} hint={hint} error={error} optional={optional} required={props.required} disabled={props.disabled}>
      <span className={styles.selectWrap}>
        <select
          {...props}
          ref={ref}
          id={id}
          className={`${styles.fieldControl} ${className}`}
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
    fieldClassName?: string;
    label: string;
    labelClassName?: string;
    hint?: string;
    error?: string;
    optional?: boolean;
  }
>(function EasyTTextArea({ className = "", fieldClassName, label, labelClassName, hint, error, optional, id: suppliedId, ...props }, ref) {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  return (
    <FieldShell className={fieldClassName} id={id} label={label} labelClassName={labelClassName} hint={hint} error={error} optional={optional} required={props.required} disabled={props.disabled}>
      <textarea
        {...props}
        ref={ref}
        id={id}
        className={`${styles.fieldControl} ${styles.textArea} ${className}`}
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
  controls?: string;
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
            aria-controls={option.controls}
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
