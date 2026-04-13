import { formatBytes } from "../../lib/format";

type Props = {
  used: number;
  quota: number;
  className?: string;
};

export default function StorageQuotaBar({ used, quota, className = "" }: Props) {
  const percent = quota > 0 ? (used / quota) * 100 : 0;
  const barColor = percent >= 95 ? "bg-red-500" : percent >= 80 ? "bg-yellow-500" : "bg-blue-500";

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">ストレージ</span>
        <span className="text-gray-500">
          {formatBytes(used)} / {formatBytes(quota)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <p className="text-xs text-gray-400">
        {percent >= 95
          ? "容量がほぼ上限です。新しい写真を受け取れません。不要な写真を削除してください。"
          : "上限を超えると新しい写真を受け取れなくなります。"}
      </p>
    </div>
  );
}
