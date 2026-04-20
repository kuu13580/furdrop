import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary:
    "bg-brand text-white hover:bg-brand-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
  secondary:
    "border border-surface-sand-deep bg-surface-sand text-ink hover:bg-surface-sand-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
  danger:
    "bg-status-danger text-white hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
  ghost:
    "text-ink-soft hover:bg-surface-sand hover:text-ink disabled:cursor-not-allowed disabled:opacity-40",
} as const;

const sizes = {
  sm: "px-3 py-1.5 text-[13px]",
  md: "px-4 py-2.5 text-[14px]",
  lg: "px-5 py-3 text-[16px]",
} as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className = "",
  type = "button",
  ...props
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-xl font-medium transition-all ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && (
        <svg
          className="-ml-1 mr-2 h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          role="img"
          aria-label="読み込み中"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
