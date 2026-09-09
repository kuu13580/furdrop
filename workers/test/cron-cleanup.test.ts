// Cron runCleanup (X04/X11/R13 + 100日保存期間)
// scheduled エンドポイントを通すと scheduled() を直接叩けないため、ハンドラを import して呼ぶ。
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { runCleanup } from "../src/cron/cleanup";
import { seedPhoto, seedUser } from "./helpers/seed";

const ONE_HOUR = 3600;
const ONE_DAY = 24 * 3600;
const RETENTION = 365 * ONE_DAY;
const HUNDRED_DAYS = 100 * ONE_DAY;

describe("runCleanup (Cron)", () => {
  it("1 時間以上 pending の写真は failed にされる (X03 アップロード未完了の救出)", async () => {
    await seedUser({ uid: "cron-uid-1", handle: "cron_pending" });
    const oldNow = Math.floor(Date.now() / 1000) - ONE_HOUR - 60;
    const photo = await seedPhoto({
      receiverId: "cron-uid-1",
      handle: "cron_pending",
      status: "pending",
      createdAt: oldNow,
    });

    await runCleanup(env);

    // failed に遷移 → cleanupFailedPhotos で物理削除されるところまで一気に走る
    const row = await env.DB.prepare("SELECT upload_status FROM photos WHERE id = ?")
      .bind(photo.photoId)
      .first<{ upload_status: string }>();
    expect(row).toBeNull(); // failed → 物理削除されるはず
  });

  // expires_at を NULL のまま seed する = 0009 のバックフィル前に入った旧データの再現。
  // Cron の COALESCE フォールバックが 365日 で判定することを確かめる。
  it("DL 期限 (365日) を過ぎた completed 写真は削除され、storage_used も減算される (R13/X11)", async () => {
    const fileSize = 1000;
    const thumbSize = 100;
    await seedUser({
      uid: "cron-uid-2",
      handle: "cron_expired",
      storage_used: fileSize + thumbSize,
    });
    const expiredAt = Math.floor(Date.now() / 1000) - RETENTION - 60;
    const photo = await seedPhoto({
      receiverId: "cron-uid-2",
      handle: "cron_expired",
      status: "completed",
      fileSize,
      thumbSize,
      createdAt: expiredAt,
      expiresAt: null, // 旧データ = COALESCE フォールバック経路
    });
    // R2 にも入れて、Cron で消えることを確認
    await env.R2_ORIGINALS.put(photo.r2KeyOriginal, new Uint8Array(fileSize));
    await env.R2_THUMBS.put(photo.r2KeyThumb, new Uint8Array(thumbSize));

    await runCleanup(env);

    const row = await env.DB.prepare("SELECT id FROM photos WHERE id = ?")
      .bind(photo.photoId)
      .first();
    expect(row).toBeNull();
    const user = await env.DB.prepare("SELECT storage_used FROM users WHERE id = ?")
      .bind("cron-uid-2")
      .first<{ storage_used: number }>();
    expect(user?.storage_used).toBe(0);
    const r2 = await env.R2_ORIGINALS.head(photo.r2KeyOriginal);
    expect(r2).toBeNull();
  });

  // 旧データ (expires_at IS NULL) が 365日 まで生き延びること。
  // 30日 判定のままだと即削除されるので、定数の取り違えをここで落とす。
  it("expires_at 未設定の旧データは、30日超でも 365日 までは削除されない (0009 バックフィルの救済)", async () => {
    await seedUser({ uid: "cron-uid-4", handle: "cron_legacy" });
    const photo = await seedPhoto({
      receiverId: "cron-uid-4",
      handle: "cron_legacy",
      status: "completed",
      createdAt: Math.floor(Date.now() / 1000) - 90 * ONE_DAY,
      expiresAt: null,
    });

    await runCleanup(env);

    const row = await env.DB.prepare("SELECT id FROM photos WHERE id = ?")
      .bind(photo.photoId)
      .first();
    expect(row).not.toBeNull();
  });

  // 焼き込み方式の肝。将来 PHOTO_RETENTION_SECONDS を短くしても、既に expires_at を
  // 持つ写真は延命されたまま = 定数変更で過去分が一斉削除される事故が起きない。
  it("expires_at が未来なら、created_at が保存期間より古くても削除されない (焼き込んだ期限が優先される)", async () => {
    await seedUser({ uid: "cron-uid-5", handle: "cron_extended" });
    const now = Math.floor(Date.now() / 1000);
    const photo = await seedPhoto({
      receiverId: "cron-uid-5",
      handle: "cron_extended",
      status: "completed",
      createdAt: now - RETENTION - ONE_DAY,
      expiresAt: now + ONE_DAY,
    });

    await runCleanup(env);

    const row = await env.DB.prepare("SELECT id FROM photos WHERE id = ?")
      .bind(photo.photoId)
      .first();
    expect(row).not.toBeNull();
  });

  it("100日経過したセッションの sender_ip / sender_ua が NULL に設定される (個情法/規約13条 保存期間制限)", async () => {
    await seedUser({ uid: "cron-uid-3", handle: "cron_session" });
    const old = Math.floor(Date.now() / 1000) - HUNDRED_DAYS - 60;
    const sessionId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO upload_sessions (id, receiver_id, photo_count, total_size, status, expires_at, sender_ip, sender_ua, created_at, updated_at)
       VALUES (?, ?, 0, 0, 'expired', ?, '203.0.113.99', 'UA-old', ?, ?)`,
    )
      .bind(sessionId, "cron-uid-3", old + 3600, old, old)
      .run();

    await runCleanup(env);

    const row = await env.DB.prepare(
      "SELECT sender_ip, sender_ua FROM upload_sessions WHERE id = ?",
    )
      .bind(sessionId)
      .first<{ sender_ip: string | null; sender_ua: string | null }>();
    expect(row?.sender_ip).toBeNull();
    expect(row?.sender_ua).toBeNull();
  });

  // 本番 Cloudflare D1 は FOREIGN KEY 制約を強制しない (内部実装) ため、R15 削除フローでは
  // 保存期間内の upload_sessions を残したまま users を消すと「孤児」状態が生まれる。
  // miniflare の D1 (SQLite) はデフォルトで FK を強制し、PRAGMA foreign_keys = OFF も
  // miniflare の D1 セッション越しには反映されないため、本番と同じ孤児状態をテスト環境で
  // 作ることができない。`cleanupOrphanedSessions` のロジック自体は 1 行の DELETE 文なので
  // 目視レビューに任せ、ここでは skip にする (将来 miniflare 側で対応されたら有効化)。
  it.skip("孤児セッション (receiver_id が users に存在しない + 100日経過) は物理削除される", async () => {
    // 省略 — 上記理由により miniflare 環境で再現不可
  });
});

describe("期限切れの通知先メールアドレス検証 (R09)", () => {
  it("期限切れの pending は破棄し、検証済みの email には触らない (目的: 打ち間違え先の第三者のアドレスを持ち続けない)", async () => {
    const now = Math.floor(Date.now() / 1000);
    await seedUser({ uid: "u-prune", handle: "prune_a" });
    await env.DB.prepare(
      `INSERT INTO notification_settings
         (receiver_id, email, pending_email, pending_token, pending_expires, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind("u-prune", "kept@example.com", "typo@examp1e.com", "tok", now - 60, now, now)
      .run();

    await runCleanup(env);

    const row = await env.DB.prepare(
      "SELECT email, pending_email, pending_token, pending_expires FROM notification_settings WHERE receiver_id = ?",
    )
      .bind("u-prune")
      .first<{
        email: string | null;
        pending_email: string | null;
        pending_token: string | null;
        pending_expires: number | null;
      }>();

    expect(row?.pending_email).toBeNull();
    expect(row?.pending_token).toBeNull();
    expect(row?.pending_expires).toBeNull();
    // 検証済みのアドレスは残る (アドレス変更の検証が流れただけなので旧アドレスへの配信は続ける)
    expect(row?.email).toBe("kept@example.com");
  });

  it("期限内の pending は残す", async () => {
    const now = Math.floor(Date.now() / 1000);
    await seedUser({ uid: "u-keep", handle: "prune_b" });
    await env.DB.prepare(
      `INSERT INTO notification_settings
         (receiver_id, pending_email, pending_token, pending_expires, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("u-keep", "fresh@example.com", "tok2", now + 3600, now, now)
      .run();

    await runCleanup(env);

    const row = await env.DB.prepare(
      "SELECT pending_email FROM notification_settings WHERE receiver_id = ?",
    )
      .bind("u-keep")
      .first<{ pending_email: string | null }>();
    expect(row?.pending_email).toBe("fresh@example.com");
  });
});
