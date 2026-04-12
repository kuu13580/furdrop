import type { ReactNode } from "react";

const styles = {
  error: "border-red-200 bg-red-50 text-red-800",
  success: "border-green-200 bg-green-50 text-green-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
} as const;

type Props = {
  variant?: keyof typeof styles;
  children: ReactNode;
  className?: string;
};

export default function Alert({ variant = "error", children, className = "" }: Props) {
  return (
    <div className={`rounded-lg border p-3 text-sm ${styles[variant]} ${className}`}>
      {children}
    </div>
  );
}
