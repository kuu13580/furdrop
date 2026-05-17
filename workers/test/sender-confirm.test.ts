// PATCH /send/:handle/sessions/:sessionId/photos/:photoId/confirm
// (X08 サーバ側サイズ検証 + X10 マジックバイト検証 + クォータ加算)
//
// 本番に近い経路を維持するため、R2 へのアップロードは /dev/images/upload/... プロキシ経由で
// 実 miniflare R2 に投入する (専用スパイは使わない)。
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { apiFetch, apiJson } from "./helpers/fetch";
import { seedUser } from "./helpers/seed";

const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff]);
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function buildBody(header: Uint8Array, totalSize: number): Uint8Array {
  const body = new Uint8Array(totalSize);
  body.set(header, 0);
  return body;
}

async function preparePhoto(handle: string, sendKey: string, fileSize: number, thumbSize: number) {
  const sess = await apiJson<{ session_id: string }>(`/send/${handle}/sessions`, {
    method: "POST",
    body: { key: sendKey, photo_count: 1 },
  });
  const sessionId = sess.body.session_id;
  const photos = await apiJson<{
    uploads: { photo_id: string; upload_url: string; thumb_upload_url: string }[];
  }>(`/send/${handle}/sessions/${sessionId}/photos`, {
    method: "POST",
    body: { photos: [{ filename: "x.jpg", file_size: fileSize, thumb_size: thumbSize }] },
  });
  return { sessionId, ...photos.body.uploads[0] };
}

describe("PATCH /send/:handle/sessions/:sessionId/photos/:photoId/confirm", () => {
  it("R2 に JPEG マジックバイト + 一致サイズで PUT 後に confirm すると 200 でクォータが加算される", async () => {
    const { handle, sendKey, uid } = await seedUser({ uid: "uid-conf-1", handle: "conf_ok" });
    const fileSize = 1024;
    const thumbSize = 128;
    const photo = await preparePhoto(handle, sendKey, fileSize, thumbSize);

    // 本物の miniflare R2 に PUT (本番と同じ Hono 経路を通す)
    await apiFetch(photo.upload_url, {
      method: "PUT",
      body: buildBody(JPEG_HEADER, fileSize),
    });
    await apiFetch(photo.thumb_upload_url, {
      method: "PUT",
      body: buildBody(JPEG_HEADER, thumbSize),
    });

    const { status, body } = await apiJson<{ upload_status: string }>(
      `/send/${handle}/sessions/${photo.sessionId}/photos/${photo.photo_id}/confirm`,
      { method: "PATCH", body: {} },
    );
    expect(status).toBe(200);
    expect(body.upload_status).toBe("completed");

    const user = await env.DB.prepare("SELECT storage_used FROM users WHERE id = ?")
      .bind(uid)
      .first<{ storage_used: number }>();
    expect(user?.storage_used).toBe(fileSize + thumbSize);
  });

  it("申告サイズと R2 上の実サイズが不一致なら 400 + R2 オブジェクトが消える (X08)", async () => {
    const { handle, sendKey } = await seedUser({ uid: "uid-conf-2", handle: "conf_size" });
    const photo = await preparePhoto(handle, sendKey, 1024, 128);

    // 1024 と申告したが 999 バイトで PUT
    await apiFetch(photo.upload_url, {
      method: "PUT",
      body: buildBody(JPEG_HEADER, 999),
    });
    await apiFetch(photo.thumb_upload_url, {
      method: "PUT",
      body: buildBody(JPEG_HEADER, 128),
    });

    const { status, body } = await apiJson<{ error: { code: string } }>(
      `/send/${handle}/sessions/${photo.sessionId}/photos/${photo.photo_id}/confirm`,
      { method: "PATCH", body: {} },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("INVALID_REQUEST");

    const original = await env.R2_ORIGINALS.head(photo.upload_url.split("/originals/")[1]);
    expect(original).toBeNull();
  });

  it("R2 上のオブジェクトが PNG マジックバイトなら 415 INVALID_FORMAT (X10 ブロック)", async () => {
    const { handle, sendKey } = await seedUser({ uid: "uid-conf-3", handle: "conf_fmt" });
    const fileSize = 1024;
    const photo = await preparePhoto(handle, sendKey, fileSize, 128);

    await apiFetch(photo.upload_url, {
      method: "PUT",
      body: buildBody(PNG_HEADER, fileSize),
    });
    await apiFetch(photo.thumb_upload_url, {
      method: "PUT",
      body: buildBody(JPEG_HEADER, 128),
    });

    const { status, body } = await apiJson<{ error: { code: string } }>(
      `/send/${handle}/sessions/${photo.sessionId}/photos/${photo.photo_id}/confirm`,
      { method: "PATCH", body: {} },
    );
    expect(status).toBe(415);
    expect(body.error.code).toBe("INVALID_FORMAT");
  });
});
