import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

const SHOW_THRESHOLD = 400;

export default function ScrollToTopButton() {
  const { t } = useLingui();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_THRESHOLD);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label={t`先頭にスクロール`}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-30 flex h-11 w-11 items-center justify-center rounded-full border border-surface-sand-deep bg-surface text-ink-soft shadow-modal transition-colors hover:bg-surface-sand hover:text-ink active:scale-[0.96]"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
