import { type ReactNode, useEffect } from "react";

type DialogSize = "sm" | "md" | "lg";

/** size はダイアログの最大幅のみを制御する。縦の制限は親ラッパーの padding に任せる */
const SIZE_CLASS: Record<DialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** ダイアログ最大幅。デフォルト "lg" */
  size?: DialogSize;
};

export default function Dialog({ open, onClose, title, children, footer, size = "lg" }: Props) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-20 backdrop-blur-sm">
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-transparent"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "dialog-title" : undefined}
        className={`relative z-10 flex max-h-full w-full ${SIZE_CLASS[size]} flex-col overflow-hidden rounded-3xl bg-surface text-ink shadow-modal`}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-surface-sand-deep px-5 py-3.5">
            <h2 id="dialog-title" className="text-[16px] font-semibold text-ink">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="rounded-full px-2 text-[20px] leading-none text-ink-muted transition-colors hover:bg-surface-sand hover:text-ink"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex-1 overflow-auto p-5">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-surface-sand-deep px-5 py-3.5">{footer}</div>
        )}
      </div>
    </div>
  );
}
