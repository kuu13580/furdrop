import { formatBytes } from "../../lib/format";

type Props = {
  used: number;
  quota: number;
  className?: string;
};

export default function StorageQuotaBar({ used, quota, className = "" }: Props) {
  const percent = quota > 0 ? (used / quota) * 100 : 0;
  // DESIGN.md §2 Quota Bar: 0–79% Sage / 80–94% Amber / 95–100% Rust
  const barColor =
    percent >= 95 ? "bg-status-danger" : percent >= 80 ? "bg-status-warn" : "bg-status-success";

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex justify-between text-[14px]">
        <span className="text-ink-soft">ストレージ</span>
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
      <p className="text-[12px] leading-[1.4] text-ink-muted">
        {percent >= 95
          ? "容量がほぼ上限です。新しい写真を受け取れません。不要な写真を削除してください。"
          : "上限を超えると新しい写真を受け取れなくなります。"}
      </p>
    </div>
  );
}
