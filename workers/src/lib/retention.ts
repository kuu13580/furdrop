/**
 * 写真の DL 期限 (R13/X11)。
 *
 * 期限の実体は INSERT 時に `photos.expires_at` へ焼き込む。この定数を使うのは
 * 「焼き込むときの既定値」と、`expires_at` が NULL の行 (0009 のバックフィルより前に
 * 入った写真) のフォールバックの 2 箇所だけ。
 *
 * この分離により、将来この値を短くしても**既存の写真は延命されたまま**になり、
 * 定数を変えた瞬間に過去分が一斉に物理削除される事故が起きない。
 */
export const PHOTO_RETENTION_DAYS = 365;
export const PHOTO_RETENTION_SECONDS = PHOTO_RETENTION_DAYS * 24 * 3600;

/**
 * 期限の実効値を返す SQL 断片。`?` には `PHOTO_RETENTION_SECONDS` を bind する。
 *
 * 期限を読む経路 (Cron の削除判定 / 写真一覧 / 写真詳細 / quota の予告集計) はすべてこれを使う。
 * フォールバック規則を 1 箇所に閉じ込めることで、経路ごとに判定がずれるのを防ぐ。
 */
export const EFFECTIVE_EXPIRES_AT = "COALESCE(expires_at, created_at + ?)";

/**
 * 「まもなく削除される」とみなす残り期間 (`GET /receiver/quota` の `expiring_soon`)。
 *
 * 受信者への予告チャネルが「ログインしたときに画面で気づく」しかない (R09 のプッシュ通知は
 * Phase 2) ため、窓を広めに取って低頻度ログインの受信者を取りこぼさないようにしている。
 * ギャラリーのサムネイルバッジはもっと短い窓 (14日 / 3日) で、そちらはフロント側で判定する。
 */
export const EXPIRY_WARNING_DAYS = 60;
export const EXPIRY_WARNING_SECONDS = EXPIRY_WARNING_DAYS * 24 * 3600;
