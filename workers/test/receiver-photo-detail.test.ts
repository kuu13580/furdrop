// GET /receiver/photos/:photoId (S08 写真詳細 + 前後ナビゲーション)
import { describe, expect, it } from "vitest";
import { authHeader, createEmulatorUser } from "./helpers/auth";
import { apiJson } from "./helpers/fetch";
import { seedPhoto, seedUser } from "./helpers/seed";

describe("GET /receiver/photos/:photoId", () => {
  it("ギャラリー順 (created_at DESC) で prev_id / next_id が正しく組まれる (キーボード矢印操作のためのデータ)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "rcv_nav" });
    const now = Math.floor(Date.now() / 1000);
    // ギャラリー順は 新 → 古 (created_at DESC)。new -> mid -> old の並び
    const newPhoto = await seedPhoto({
      receiverId: uid,
      handle: "rcv_nav",
      createdAt: now,
      status: "completed",
    });
    const midPhoto = await seedPhoto({
      receiverId: uid,
      handle: "rcv_nav",
      createdAt: now - 10,
      status: "completed",
    });
    const oldPhoto = await seedPhoto({
      receiverId: uid,
      handle: "rcv_nav",
      createdAt: now - 20,
      status: "completed",
    });

    const { status, body } = await apiJson<{
      prev_id: string | null;
      next_id: string | null;
    }>(`/receiver/photos/${midPhoto.photoId}`, { headers: authHeader(idToken) });

    expect(status).toBe(200);
    // mid から見て prev (新しい方) = newPhoto、next (古い方) = oldPhoto
    expect(body.prev_id).toBe(newPhoto.photoId);
    expect(body.next_id).toBe(oldPhoto.photoId);
  });

  // 削除予定日の表示に使う値。旧データ (NULL) も created_at + 365日 に解決して返るので、
  // クライアントは保存期間の定数を持たなくてよい
  it("expires_at が実効値で返る。旧データ (NULL) は created_at + 365日 に解決される (R13)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "rcv_exp" });
    const createdAt = Math.floor(Date.now() / 1000) - 10 * 24 * 3600;
    const legacy = await seedPhoto({
      receiverId: uid,
      handle: "rcv_exp",
      createdAt,
      expiresAt: null,
    });

    const { status, body } = await apiJson<{ photo: { expires_at: number } }>(
      `/receiver/photos/${legacy.photoId}`,
      { headers: authHeader(idToken) },
    );

    expect(status).toBe(200);
    expect(body.photo.expires_at).toBe(createdAt + 365 * 24 * 3600);
  });

  it("他人の写真ID では 404 NOT_FOUND (権限境界)", async () => {
    const me = await createEmulatorUser();
    await seedUser({ uid: me.uid, handle: "rcv_dt_me" });

    await seedUser({ uid: "uid-otherx", handle: "rcv_dt_other" });
    const others = await seedPhoto({
      receiverId: "uid-otherx",
      handle: "rcv_dt_other",
      status: "completed",
    });

    const { status } = await apiJson<unknown>(`/receiver/photos/${others.photoId}`, {
      headers: authHeader(me.idToken),
    });
    expect(status).toBe(404);
  });
});
