import { subtractStorageUsage } from "../lib/quota";
import type { Env } from "../types";

const ONE_HOUR = 3600;
const THIRTY_DAYS = 30 * 24 * 3600;
// 利用規約 第13条 / プライバシーポリシー 第11項で「最低3か月」と定めるため、
// 暦上最短の3か月 (Feb-Apr=89日) を確実に上回る100日を採用
const SESSION_LOG_RETENTION = 100 * 24 * 3600;
const BATCH_SIZE = 50;

export async function runCleanup(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  await markFailedPhotos(env, now);
  await expireSessions(env, now);
  await cleanupFailedPhotos(env);
  await cleanupExpiredPhotos(env, now);
  await pruneOldSessionLogs(env, now);
  await cleanupOrphanedSessions(env, now);
}

/** 1. pending写真のタイムアウト (1時間経過 → failed) */
async function markFailedPhotos(env: Env, now: number): Promise<void> {
  const cutoff = now - ONE_HOUR;
  await env.DB.prepare(
    `UPDATE photos SET upload_status = 'failed', updated_at = ?
     WHERE upload_status = 'pending' AND created_at < ?`,
  )
    .bind(now, cutoff)
    .run();
}

/** 2. 期限切れセッション → expired */
async function expireSessions(env: Env, now: number): Promise<void> {
  await env.DB.prepare(
    `UPDATE upload_sessions SET status = 'expired', updated_at = ?
     WHERE status = 'active' AND expires_at < ?`,
  )
    .bind(now, now)
    .run();
}

/** 3. failed写真のR2ゴミ回収 + D1レコード削除 */
async function cleanupFailedPhotos(env: Env): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT id, r2_key_original, r2_key_thumb FROM photos
     WHERE upload_status = 'failed' LIMIT ?`,
  )
    .bind(BATCH_SIZE)
    .all();

  for (const row of rows.results) {
    await Promise.all([
      env.R2_ORIGINALS.delete(row.r2_key_original as string),
      env.R2_THUMBS.delete(row.r2_key_thumb as string),
    ]);
    await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(row.id).run();
  }
}

/** 4. DL期限切れ completed 写真の自動削除 (R13/X11) */
async function cleanupExpiredPhotos(env: Env, now: number): Promise<void> {
  // expires_at が設定されている場合はその値、NULLの場合は created_at + 30日
  const rows = await env.DB.prepare(
    `SELECT id, receiver_id, r2_key_original, r2_key_thumb, file_size, thumb_size
     FROM photos
     WHERE upload_status = 'completed'
       AND COALESCE(expires_at, created_at + ?) < ?
     LIMIT ?`,
  )
    .bind(THIRTY_DAYS, now, BATCH_SIZE)
    .all();

  for (const row of rows.results) {
    await Promise.all([
      env.R2_ORIGINALS.delete(row.r2_key_original as string),
      env.R2_THUMBS.delete(row.r2_key_thumb as string),
    ]);

    const totalSize = (row.file_size as number) + (row.thumb_size as number);
    await subtractStorageUsage(env.DB, row.receiver_id as string, totalSize);
    await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(row.id).run();
  }
}

/** 5. 保存期間 (最低3か月=100日) を経過したセッションの IP / UA を消去 (発信者情報開示対応のための合理的保存期間) */
async function pruneOldSessionLogs(env: Env, now: number): Promise<void> {
  const cutoff = now - SESSION_LOG_RETENTION;
  await env.DB.prepare(
    `UPDATE upload_sessions SET sender_ip = NULL, sender_ua = NULL, updated_at = ?
     WHERE created_at < ? AND (sender_ip IS NOT NULL OR sender_ua IS NOT NULL)`,
  )
    .bind(now, cutoff)
    .run();
}

/**
 * 6. アカウント削除時に保存期間 (100日) を満たすため残された孤児セッション
 *    (receiver_id が users に存在しない、かつ 100日経過済み) を物理削除。
 *    DELETE /auth/account は保存期間中の sender_ip/ua を保護するため
 *    100日未満のセッションを残す。それらの保存期間が経過した時点でこの Cron が回収する。
 */
async function cleanupOrphanedSessions(env: Env, now: number): Promise<void> {
  const cutoff = now - SESSION_LOG_RETENTION;
  await env.DB.prepare(
    `DELETE FROM upload_sessions
       WHERE created_at < ?
         AND receiver_id NOT IN (SELECT id FROM users)`,
  )
    .bind(cutoff)
    .run();
}
