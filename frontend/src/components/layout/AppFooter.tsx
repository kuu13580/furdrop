const FEEDBACK_URL = import.meta.env.VITE_FEEDBACK_URL ?? "";

export default function AppFooter() {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-surface-sand-deep bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 text-[12px] text-ink-muted">
        <span>FurDrop</span>
        {FEEDBACK_URL && (
          <a
            href={FEEDBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-brand"
          >
            フィードバック・不具合報告
          </a>
        )}
      </div>
    </footer>
  );
}
