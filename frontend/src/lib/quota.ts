/**
 * ストレージ使用率のしきい値 (R07)。DESIGN.md §2 Quota Bar の色分けと対応する。
 *
 * ダッシュボードは警告バナーとプログレスバーを同じ画面に並べるので、しきい値が
 * 二重定義されていると片方だけ動いて表示が食い違う。ここを唯一の定義にする。
 */
export const QUOTA_WARN_PERCENT = 80;
export const QUOTA_DANGER_PERCENT = 95;

export function usagePercent(used: number, quota: number): number {
  return quota > 0 ? (used / quota) * 100 : 0;
}

/**
 * 実際に新しい写真を受け取れなくなる境界。
 *
 * サーバーは `storage_used >= storage_quota` でしか止めない (`GET /send/:handle` の
 * `is_accepting`)。95% は「危険域」であって受付停止ではないので、
 * 「受け取れません」と断定してよいのはここを超えたときだけ。
 */
export function isQuotaFull(used: number, quota: number): boolean {
  return usagePercent(used, quota) >= 100;
}
