function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

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
    </div>
  );
}
