// POST /send/:handle/sessions (R16 アクセスキー検証 + X02/X03 セッション作成)
import { describe, expect, it } from "vitest";
import { apiJson } from "./helpers/fetch";
import { seedUser } from "./helpers/seed";

describe("POST /send/:handle/sessions", () => {
  it("正しい key + 受付中ユーザーで 201 + session_id を返す (S03 送信開始の正常系)", async () => {
    const { handle, sendKey } = await seedUser({ uid: "uid-sess-1", handle: "sess_active" });
    const { status, body } = await apiJson<{ session_id: string; expires_at: number }>(
      `/send/${handle}/sessions`,
      {
        method: "POST",
        body: { key: sendKey, sender_name: "@hanako", photo_count: 3 },
      },
    );
    expect(status).toBe(201);
    expect(body.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("間違った key では 403 INVALID_KEY を返す (R16: handle 推測だけで送信されないことの担保)", async () => {
    const { handle } = await seedUser({ uid: "uid-sess-2", handle: "sess_keytest" });
    const { status, body } = await apiJson<{ error: { code: string } }>(
      `/send/${handle}/sessions`,
      {
        method: "POST",
        body: { key: "obviously-invalid-key-xxxx", photo_count: 1 },
      },
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("INVALID_KEY");
  });

  it("require_sender_name=1 の受信者に sender_name なしで開始すると 400 (R14: 名前必須の UI バイパス防止)", async () => {
    const { handle, sendKey } = await seedUser({
      uid: "uid-sess-reqname",
      handle: "sess_reqname",
      require_sender_name: 1,
    });
    const noName = await apiJson<{ error: { code: string } }>(`/send/${handle}/sessions`, {
      method: "POST",
      body: { key: sendKey, photo_count: 1 },
    });
    expect(noName.status).toBe(400);
    expect(noName.body.error.code).toBe("INVALID_REQUEST");

    // 空白のみの名前も拒否
    const blank = await apiJson<{ error: { code: string } }>(`/send/${handle}/sessions`, {
      method: "POST",
      body: { key: sendKey, sender_name: "   ", photo_count: 1 },
    });
    expect(blank.status).toBe(400);

    // 名前ありなら 201
    const named = await apiJson<{ session_id: string }>(`/send/${handle}/sessions`, {
      method: "POST",
      body: { key: sendKey, sender_name: "@hanako", photo_count: 1 },
    });
    expect(named.status).toBe(201);
  });

  it("受信者のクォータが満杯なら 507 QUOTA_EXCEEDED (満杯時に送信開始すらできない)", async () => {
    const { handle, sendKey } = await seedUser({
      uid: "uid-sess-3",
      handle: "sess_full",
      storage_used: 10737418240,
      storage_quota: 10737418240,
    });
    const { status, body } = await apiJson<{ error: { code: string } }>(
      `/send/${handle}/sessions`,
      {
        method: "POST",
        body: { key: sendKey, photo_count: 1 },
      },
    );
    expect(status).toBe(507);
    expect(body.error.code).toBe("QUOTA_EXCEEDED");
  });

  it("受付停止中 (is_active=0) は 403 FORBIDDEN (R11 受付停止の効果)", async () => {
    const { handle, sendKey } = await seedUser({
      uid: "uid-sess-4",
      handle: "sess_paused",
      is_active: 0,
    });
    const { status, body } = await apiJson<{ error: { code: string } }>(
      `/send/${handle}/sessions`,
      {
        method: "POST",
        body: { key: sendKey, photo_count: 1 },
      },
    );
    expect(status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
