// DELETE /auth/account (R15 受信者アカウント削除)
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authHeader, createEmulatorUser } from "./helpers/auth";
import { apiJson } from "./helpers/fetch";
import { seedPhoto, seedUser } from "./helpers/seed";

describe("DELETE /auth/account", () => {
  it("confirm_handle が一致しないと 400 (誤操作防止のサーバ側ガード)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "deletable_a" });
    const { status, body } = await apiJson<{ error: { code: string } }>("/auth/account", {
      method: "DELETE",
      headers: authHeader(idToken),
      body: { confirm_handle: "wrong_handle" },
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("一致時は 204 で users / photos / send_keys が削除される (R15 の基本動作)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "deletable_b" });
    await seedPhoto({ receiverId: uid, handle: "deletable_b", status: "completed" });

    const { status } = await apiJson<unknown>("/auth/account", {
      method: "DELETE",
      headers: authHeader(idToken),
      body: { confirm_handle: "deletable_b" },
    });
    expect(status).toBe(204);

    const userRow = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(uid).first();
    expect(userRow).toBeNull();

    const photos = await env.DB.prepare("SELECT id FROM photos WHERE receiver_id = ?")
      .bind(uid)
      .all();
    expect(photos.results).toHaveLength(0);

    const keys = await env.DB.prepare("SELECT id FROM send_keys WHERE receiver_id = ?")
      .bind(uid)
      .all();
    expect(keys.results).toHaveLength(0);
  });

  it("保存期間 (100日) 未満の upload_sessions は孤児として残る (利用規約13条: sender_ip/ua 保護)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "deletable_c" });

    // 直近のセッション (1日前) を作る
    const recentSessionId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO upload_sessions (id, receiver_id, sender_name, photo_count, total_size, status, expires_at, sender_ip, sender_ua, created_at, updated_at)
       VALUES (?, ?, NULL, 0, 0, 'active', ?, '203.0.113.1', 'UA-recent', ?, ?)`,
    )
      .bind(recentSessionId, uid, now + 3600, now - 86400, now - 86400)
      .run();

    await apiJson<unknown>("/auth/account", {
      method: "DELETE",
      headers: authHeader(idToken),
      body: { confirm_handle: "deletable_c" },
    });

    // ユーザーは消えているが、保存期間内セッションは残る (= 孤児)
    const remaining = await env.DB.prepare(
      "SELECT id, sender_ip, sender_ua FROM upload_sessions WHERE id = ?",
    )
      .bind(recentSessionId)
      .first<{ id: string; sender_ip: string; sender_ua: string }>();
    expect(remaining).toBeTruthy();
    expect(remaining?.sender_ip).toBe("203.0.113.1");
    expect(remaining?.sender_ua).toBe("UA-recent");
  });
});
