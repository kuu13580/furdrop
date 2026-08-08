import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useNavigate } from "react-router";
import remarkGfm from "remark-gfm";
import logoUrl from "../assets/logos/logo.png";
import LocaleToggle from "../components/ui/LocaleToggle";
import privacyMd from "../content/legal/privacy.md?raw";
import termsMd from "../content/legal/terms.md?raw";

const FEEDBACK_URL = import.meta.env.VITE_FEEDBACK_URL ?? "";

type Doc = "terms" | "privacy";

const TITLES: Record<Doc, string> = {
  terms: "利用規約",
  privacy: "プライバシーポリシー",
};

function resolvePlaceholders(md: string): string {
  if (FEEDBACK_URL) {
    return md.replaceAll("[お問い合わせフォーム]", `[お問い合わせフォーム](${FEEDBACK_URL})`);
  }
  return md;
}

const components: ComponentPropsWithoutRef<typeof ReactMarkdown>["components"] = {
  h1: ({ children }) => (
    <h1 className="mt-2 mb-6 text-[28px] font-bold leading-[1.25] tracking-[-0.015em] text-ink">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-10 mb-3 text-[22px] font-semibold leading-[1.30] tracking-[-0.01em] text-ink">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 mb-2 text-[18px] font-semibold leading-[1.35] text-ink">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-4 mb-2 text-[16px] font-semibold leading-[1.45] text-ink">{children}</h4>
  ),
  p: ({ children }) => <p className="my-3 text-[15px] leading-[1.75] text-ink-soft">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1 pl-6 text-[15px] leading-[1.75] text-ink-soft marker:text-ink-muted">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1 pl-6 text-[15px] leading-[1.75] text-ink-soft marker:text-ink-muted">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href ?? "#"}
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
      className="break-words text-brand underline decoration-brand/40 underline-offset-2 transition-colors hover:text-brand-deep hover:decoration-brand"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-8 border-t border-surface-sand-deep" />,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 border-brand/40 bg-surface-sand/40 px-4 py-2 text-[14px] text-ink-soft">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-surface-sand px-1.5 py-0.5 font-mono text-[13px] text-ink">
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-[14px] leading-[1.6] text-ink-soft">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-sand text-ink">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-surface-sand-deep px-3 py-2 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-surface-sand-deep px-3 py-2 align-top">{children}</td>
  ),
};

export default function LegalPage({ doc }: { doc: Doc }) {
  const navigate = useNavigate();
  const md = resolvePlaceholders(doc === "terms" ? termsMd : privacyMd);

  return (
    <div className="flex min-h-dvh flex-col bg-surface-canvas pb-12 text-ink antialiased">
      <header className="sticky top-0 z-20 border-b border-surface-sand-deep bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center">
            <img src={logoUrl} alt="FurDrop" className="h-9" />
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) navigate(-1);
                else navigate("/");
              }}
              className="rounded-lg px-3 py-2 text-[14px] text-ink-soft transition-colors hover:bg-surface-sand hover:text-ink"
            >
              戻る
            </button>
            <LocaleToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <p className="mb-1 text-[12px] font-medium tracking-[0.08em] text-ink-muted uppercase">
          {doc === "terms" ? "Terms of Service" : "Privacy Policy"}
        </p>
        <article className="legal-doc">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {md}
          </ReactMarkdown>
        </article>

        <nav className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-surface-sand-deep pt-6 text-[14px]">
          {doc === "terms" ? (
            <Link to="/privacy" className="text-brand underline-offset-2 hover:underline">
              プライバシーポリシー
            </Link>
          ) : (
            <Link to="/terms" className="text-brand underline-offset-2 hover:underline">
              利用規約
            </Link>
          )}
          {FEEDBACK_URL && (
            <a
              href={FEEDBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline-offset-2 hover:underline"
            >
              お問い合わせ
            </a>
          )}
        </nav>
      </main>
    </div>
  );
}

export { TITLES as LEGAL_TITLES };
