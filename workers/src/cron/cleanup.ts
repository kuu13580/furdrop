import { logError } from "../lib/logger";
import { subtractStorageUsageStmt } from "../lib/quota";
import { EFFECTIVE_EXPIRES_AT, PHOTO_RETENTION_SECONDS } from "../lib/retention";
import type { Env } from "../types";

const ONE_HOUR = 3600;
// 利用規約 第13条 / プライバシーポリシー 第11項で「最低3か月」と定めるため、
// 暦上最短の3か月 (Feb-Apr=89日) を確実に上回る100日を採用
const SESSION_LOG_RETENTION = 100 * 24 * 3600;
const BATCH_SIZE = 50;

export async function runCleanup(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // ステップを個別に握って続行する。1 ステップの失敗で後続がスキップされると、
  // 期限切れ写真が消えない等の副作用が積み上がるため。失敗があれば最後に集約 throw する。
  const steps: [string, () => Promise<void>][] = [
    ["markFailedPhotos", () => markFailedPhotos(env, now)],
    ["expireSessions", () => expireSessions(env, now)],
    ["cleanupFailedPhotos", () => cleanupFailedPhotos(env)],
    ["cleanupExpiredPhotos", () => cleanupExpiredPhotos(env, now)],
    ["pruneOldSessionLogs", () => pruneOldSessionLogs(env, now)],
    ["cleanupOrphanedSessions", () => cleanupOrphanedSessions(env, now)],
  ];

  let failedSteps = 0;
  for (const [name, fn] of steps) {
    try {
      await fn();
    } catch (err) {
      failedSteps++;
      logError("cron-step", err, { step: name });
    }
  }

  if (failedSteps > 0) {
    throw new Error(`cleanup finished with ${failedSteps}/${steps.length} failed step(s)`);
  }
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
    // 1 件の R2/D1 失敗でループ全体を止めない(止めると残りは次回 cron まで持ち越し)。
    try {
      await Promise.all([
        env.R2_ORIGINALS.delete(row.r2_key_original as string),
        env.R2_THUMBS.delete(row.r2_key_thumb as string),
      ]);
      await env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(row.id).run();
    } catch (err) {
      logError("cron-cleanupFailedPhotos", err, { photoId: row.id });
    }
  }
}

/** 4. DL期限切れ completed 写真の自動削除 (R13/X11) */
async function cleanupExpiredPhotos(env: Env, now: number): Promise<void> {
  // 通常は INSERT 時に焼き込まれた expires_at を見る。NULL になるのは 0009 の
  // バックフィルより前に入った行と、「migration 適用 → 新コードのデプロイ」の
  // 隙間に届いた行だけで、それらは created_at + 180日 にフォールバックさせる。
  const rows = await env.DB.prepare(
    `SELECT id, receiver_id, r2_key_original, r2_key_thumb, file_size, thumb_size
     FROM photos
     WHERE upload_status = 'completed'
       AND ${EFFECTIVE_EXPIRES_AT} < ?
     LIMIT ?`,
  )
    .bind(PHOTO_RETENTION_SECONDS, now, BATCH_SIZE)
    .all();

  for (const row of rows.results) {
    // 1 件の失敗でループ全体を止めない (cleanupFailedPhotos と同じ理由)。
    try {
      await Promise.all([
        env.R2_ORIGINALS.delete(row.r2_key_original as string),
        env.R2_THUMBS.delete(row.r2_key_thumb as string),
      ]);

      const totalSize = (row.file_size as number) + (row.thumb_size as number);
      // storage_used 減算と photos 削除は原子的に実行する (partial failure で
      // 使用量が再減算されたり戻らなかったりする不整合を防ぐ)。
      await env.DB.batch([
        subtractStorageUsageStmt(env.DB, row.receiver_id as string, totalSize),
        env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(row.id),
      ]);
    } catch (err) {
      logError("cron-cleanupExpiredPhotos", err, {
        photoId: row.id,
        receiverId: row.receiver_id,
      });
    }
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
