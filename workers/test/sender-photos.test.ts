// POST /send/:handle/sessions/:sessionId/photos (Presigned URL 発行 + R14 サーバ側必須検証)
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { apiJson } from "./helpers/fetch";
import { seedUser } from "./helpers/seed";

async function createSession(handle: string, sendKey: string, photoCount: number) {
  const res = await apiJson<{ session_id: string }>(`/send/${handle}/sessions`, {
    method: "POST",
    body: { key: sendKey, photo_count: photoCount },
  });
  if (res.status !== 201) throw new Error(`failed to create session: ${res.status}`);
  return res.body.session_id;
}

describe("POST /send/:handle/sessions/:sessionId/photos", () => {
  it("Presigned URL (dev モードでは /dev/images/upload/... プロキシ) と photo_id が枚数分返り、photos が pending で作成される", async () => {
    const { handle, sendKey } = await seedUser({ uid: "uid-ph-1", handle: "ph_normal" });
    const sessionId = await createSession(handle, sendKey, 2);

    const { status, body } = await apiJson<{
      uploads: { photo_id: string; upload_url: string; thumb_upload_url: string }[];
      expires_in: number;
    }>(`/send/${handle}/sessions/${sessionId}/photos`, {
      method: "POST",
      body: {
        photos: [
          { filename: "a.jpg", file_size: 1024, thumb_size: 128, width: 100, height: 100 },
          { filename: "b.jpg", file_size: 2048, thumb_size: 256, width: 200, height: 200 },
        ],
      },
    });
    expect(status).toBe(201);
    expect(body.uploads).toHaveLength(2);
    expect(body.uploads[0].upload_url).toMatch(/^\/dev\/images\/upload\/originals\//);
    expect(body.uploads[0].thumb_upload_url).toMatch(/^\/dev\/images\/upload\/thumbs\//);

    const pending = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM photos WHERE session_id = ? AND upload_status = 'pending'",
    )
      .bind(sessionId)
      .first<{ cnt: number }>();
    expect(pending?.cnt).toBe(2);

    // DL 期限は受信時点で実値を焼き込む (R13)。COALESCE のフォールバック任せにしないことで、
    // 将来 PHOTO_RETENTION_SECONDS を短くしても過去分が一斉削除されない
    const baked = await env.DB.prepare(
      "SELECT created_at, expires_at FROM photos WHERE session_id = ? LIMIT 1",
    )
      .bind(sessionId)
      .first<{ created_at: number; expires_at: number }>();
    expect(baked?.expires_at).toBe((baked?.created_at ?? 0) + 365 * 24 * 3600);
  });

  it("受信者が watermark_mode=required で watermark_text が欠落していたら 400 (R14 サーバ側強制)", async () => {
    const { handle, sendKey } = await seedUser({
      uid: "uid-ph-2",
      handle: "ph_required",
      watermark_mode: "required",
    });
    const sessionId = await createSession(handle, sendKey, 1);

    const { status, body } = await apiJson<{ error: { code: string; message: string } }>(
      `/send/${handle}/sessions/${sessionId}/photos`,
      {
        method: "POST",
        body: {
          photos: [{ filename: "x.jpg", file_size: 1024, thumb_size: 128 }], // watermark_text なし
        },
      },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.error.message).toMatch(/watermark/i);
  });

  it("写真の合計サイズが残クォータを超えると 507 QUOTA_EXCEEDED (1 セッション内の楽観チェック)", async () => {
    const { handle, sendKey } = await seedUser({
      uid: "uid-ph-3",
      handle: "ph_tight",
      storage_used: 10737418000, // 残り 240 bytes
      storage_quota: 10737418240,
    });
    const sessionId = await createSession(handle, sendKey, 1);

    const { status, body } = await apiJson<{ error: { code: string } }>(
      `/send/${handle}/sessions/${sessionId}/photos`,
      {
        method: "POST",
        body: {
          photos: [{ filename: "big.jpg", file_size: 500_000, thumb_size: 128 }],
        },
      },
    );
    expect(status).toBe(507);
    expect(body.error.code).toBe("QUOTA_EXCEEDED");
  });
});
