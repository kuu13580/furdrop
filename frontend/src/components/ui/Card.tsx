import type { ReactNode } from "react";

type Props = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export default function Card({ title, children, className = "" }: Props) {
  return (
    <div className={`rounded-[20px] bg-surface p-6 shadow-card ${className}`}>
      {title && (
        <h2 className="mb-4 text-[18px] font-semibold tracking-[-0.005em] text-ink">{title}</h2>
      )}
      {children}
    </div>
  );
}
