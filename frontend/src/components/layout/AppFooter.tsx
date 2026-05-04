import { Link } from "react-router";

const FEEDBACK_URL = import.meta.env.VITE_FEEDBACK_URL ?? "";

export default function AppFooter() {
  return (
    <footer className="sticky bottom-0 z-10 mt-auto border-t border-surface-sand-deep bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-[12px] text-ink-muted">
        <span>FurDrop</span>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link to="/terms" className="transition-colors hover:text-brand">
            利用規約
          </Link>
          <Link to="/privacy" className="transition-colors hover:text-brand">
            プライバシー
          </Link>
          {FEEDBACK_URL && (
            <a
              href={FEEDBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-brand"
            >
              お問い合わせ・通報
            </a>
          )}
        </nav>
      </div>
    </footer>
  );
}
