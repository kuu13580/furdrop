/**
 * 写真の DL 期限 (R13) を画面に落とすためのしきい値と計算。
 *
 * 「何日で消えるか」はサーバーが `expires_at` を実効値で返すので、ここが持つのは
 * 「どれくらい近づいたら警告を出すか」だけ。保存期間そのものの定数はここには置かない。
 */

/**
 * ダッシュボードの予告バナーと、写真詳細の削除予定日を警告色にする残り日数。
 * サーバー側 `EXPIRY_WARNING_DAYS` (= `expiring_soon` の集計窓) と揃える。
 *
 * メール通知 (R09) は 14日 / 3日 のもっと短い窓で送る。バナーは「ログインしたときに
 * 気づく」受動的なチャネルなので窓を広く、メールは行動できる距離で、と役割を分けている。
 */
export const BANNER_DAYS = 30;

/** ギャラリーのサムネイルにバッジを出す残り日数。全件に出すとノイズになるので短めに切る */
export const BADGE_DAYS = 14;

/** バッジを警告色 (Rust) に切り替える残り日数 */
export const BADGE_DANGER_DAYS = 3;

/**
 * 期限までの残り日数。
 *
 * 切り上げなので「あと数時間」は 1 を返す (「残り0日」と出して当日中に消えるとは限らない
 * 誤解を避ける)。期限を過ぎている場合 — Cron が次に回るまでの猶予 — は 0。
 */
export function daysUntilExpiry(expiresAt: number, nowMs: number = Date.now()): number {
  const remainingSec = expiresAt - Math.floor(nowMs / 1000);
  return Math.max(0, Math.ceil(remainingSec / 86400));
}

/** サムネイルバッジの表示レベル。`null` はバッジを出さない */
export function expiryBadgeLevel(
  expiresAt: number,
  nowMs: number = Date.now(),
): "warn" | "danger" | null {
  const days = daysUntilExpiry(expiresAt, nowMs);
  if (days <= BADGE_DANGER_DAYS) return "danger";
  if (days <= BADGE_DAYS) return "warn";
  return null;
}
