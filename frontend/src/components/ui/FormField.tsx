import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export default function FormField({ label, error, hint, id, className = "", ...props }: Props) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-[14px] font-medium text-ink">
        {label}
      </label>
      <input
        id={fieldId}
        className={`block w-full rounded-xl border bg-surface px-4 py-3 text-[14px] text-ink placeholder:text-ink-muted transition-all focus:outline-none focus:ring-3 disabled:bg-surface-sand disabled:text-ink-muted ${
          error
            ? "border-status-danger focus:border-status-danger focus:ring-status-danger/15"
            : "border-surface-sand-deep focus:border-brand focus:ring-brand/15"
        } ${className}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        {...props}
      />
      {error && (
        <p id={`${fieldId}-error`} className="text-[13px] text-status-danger">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${fieldId}-hint`} className="text-[13px] text-ink-soft">
          {hint}
        </p>
      )}
    </div>
  );
}
