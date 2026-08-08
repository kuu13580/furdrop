import { Trans } from "@lingui/react/macro";
import { Link } from "react-router";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-canvas px-4 text-ink">
      <div className="space-y-4 text-center">
        <h1 className="text-[72px] font-bold tracking-[-0.03em] text-ink-muted">404</h1>
        <p className="text-[16px] text-ink-soft">
          <Trans>ページが見つかりません</Trans>
        </p>
        <Link
          to="/"
          className="inline-block rounded-lg px-3 py-1.5 font-medium text-brand transition-colors hover:bg-brand-tint"
        >
          <Trans>トップに戻る</Trans>
        </Link>
      </div>
    </div>
  );
}
