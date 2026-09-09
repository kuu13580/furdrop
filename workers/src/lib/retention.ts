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
 * 予告のチャネルは 3 段になっている。**それぞれ役割が違うので窓も違う**:
 *
 * | チャネル | 窓 | 役割 |
 * |---|---|---|
 * | ダッシュボードのバナー (ここ) | 30日 | 受動的。ログインしたときに気づかせる |
 * | メール通知 (R09 `EXPIRY_NOTICE_DAYS`) | 14日 / 3日 | 能動的。行動できる距離で押しに行く |
 * | ギャラリーのバッジ (`BADGE_DAYS`) | 14日 / 3日 | 写真単位。どれが消えるかを示す |
 *
 * かつては 60日だった。予告が「ログインしたときに画面で気づく」しかなく、低頻度ログインの
 * 受信者を取りこぼさないよう窓を広く取っていたため。メール通知が入ってその前提が消えた一方、
 * イベント型の使い方では 1 バーストが 60 日間バナーを出しっぱなしにして壁紙になるので、
 * 30日に狭めた。取りこぼしの手当てはメールが引き取っている。
 */
export const EXPIRY_WARNING_DAYS = 30;
export const EXPIRY_WARNING_SECONDS = EXPIRY_WARNING_DAYS * 24 * 3600;
