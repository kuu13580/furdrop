/**
 * UNIX 秒を「年月日 時分」の表示文字列にする。
 *
 * Phase 2 (i18n) でアクティブロケールを渡すようになるまでの既定は "ja-JP"。
 * タイムゾーンはブラウザのローカル TZ に従う (日付グルーピングの日境界は
 * `lib/timezone.ts` の getTzOffsetMin が別途サーバーと揃えている)。
 */
export function formatDateTime(unix: number, locale = "ja-JP"): string {
  return new Date(unix * 1000).toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
