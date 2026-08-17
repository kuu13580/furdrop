import { Trans } from "@lingui/react/macro";
import { formatBytes } from "../../lib/format";
import {
  isQuotaFull,
  QUOTA_DANGER_PERCENT,
  QUOTA_WARN_PERCENT,
  usagePercent,
} from "../../lib/quota";

type Props = {
  used: number;
  quota: number;
  /** false にすると下の説明文を出さない。呼び出し側が同じ内容をバナーで出す場合に使う */
  hint?: boolean;
  className?: string;
};

export default function StorageQuotaBar({ used, quota, hint = true, className = "" }: Props) {
  const percent = usagePercent(used, quota);
  // DESIGN.md §2 Quota Bar: 0–79% Sage / 80–94% Amber / 95–100% Rust
  const barColor =
    percent >= QUOTA_DANGER_PERCENT
      ? "bg-status-danger"
      : percent >= QUOTA_WARN_PERCENT
        ? "bg-status-warn"
        : "bg-status-success";

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex justify-between text-[14px]">
        <span className="text-ink-soft">
          <Trans>ストレージ</Trans>
        </span>
        <span className="font-mono text-ink-soft">
          {formatBytes(used)} / {formatBytes(quota)}
          <span className="ml-1 text-ink-muted">({percent.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-sand">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-out ${barColor}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      {hint && (
        <p className="text-[12px] leading-[1.4] text-ink-muted">
          {/* 実際に受付が止まるのは上限に達してから。95% は危険域だがまだ受け取れる */}
          {isQuotaFull(used, quota) ? (
            <Trans>
              容量が上限に達しました。新しい写真を受け取れません。不要な写真を削除してください。
            </Trans>
          ) : (
            <Trans>上限を超えると新しい写真を受け取れなくなります。</Trans>
          )}
        </p>
      )}
    </div>
  );
}
