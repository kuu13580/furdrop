import type { ReactNode } from "react";

const styles = {
  error: "border-status-danger/30 bg-status-danger-tint text-status-danger",
  success: "border-status-success/30 bg-status-success-tint text-status-success",
  info: "border-brand/30 bg-brand-tint text-brand-deep",
} as const;

type Props = {
  variant?: keyof typeof styles;
  children: ReactNode;
  className?: string;
};

export default function Alert({ variant = "error", children, className = "" }: Props) {
  return (
    <div
      role={variant === "error" ? "alert" : undefined}
      className={`rounded-xl border px-4 py-3 text-[14px] ${styles[variant]} ${className}`}
    >
      {children}
    </div>
  );
}
