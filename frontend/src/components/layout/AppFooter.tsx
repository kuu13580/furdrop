const FEEDBACK_URL = import.meta.env.VITE_FEEDBACK_URL ?? "";

export default function AppFooter() {
  return (
    <footer className="mt-auto border-t bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 text-xs text-gray-500">
        <span>FurDrop</span>
        {FEEDBACK_URL && (
          <a
            href={FEEDBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-700 hover:underline"
          >
            フィードバック・不具合報告
          </a>
        )}
      </div>
    </footer>
  );
}
