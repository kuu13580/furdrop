// DELETE /receiver/photos/:photoId (R06 単体削除 + クォータ減算)
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authHeader, createEmulatorUser } from "./helpers/auth";
import { apiFetch, apiJson } from "./helpers/fetch";
import { seedPhoto, seedUser } from "./helpers/seed";

describe("DELETE /receiver/photos/:photoId", () => {
  it("D1 から消え、storage_used が file_size + thumb_size 分減算される (R06)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    const fileSize = 5000;
    const thumbSize = 500;
    await seedUser({
      uid,
      handle: "rcv_del",
      storage_used: fileSize + thumbSize, // 削除で 0 になる想定
    });
    const photo = await seedPhoto({
      receiverId: uid,
      handle: "rcv_del",
      status: "completed",
      fileSize,
      thumbSize,
    });

    // 実 R2 にも投入しておく (削除が R2 にも届くかを確認)
    await env.R2_ORIGINALS.put(photo.r2KeyOriginal, new Uint8Array(fileSize));
    await env.R2_THUMBS.put(photo.r2KeyThumb, new Uint8Array(thumbSize));

    const res = await apiFetch(`/receiver/photos/${photo.photoId}`, {
      method: "DELETE",
      headers: authHeader(idToken),
    });
    expect(res.status).toBe(204);

    const row = await env.DB.prepare("SELECT id FROM photos WHERE id = ?")
      .bind(photo.photoId)
      .first();
    expect(row).toBeNull();

    const user = await env.DB.prepare("SELECT storage_used FROM users WHERE id = ?")
      .bind(uid)
      .first<{ storage_used: number }>();
    expect(user?.storage_used).toBe(0);

    const r2 = await env.R2_ORIGINALS.head(photo.r2KeyOriginal);
    expect(r2).toBeNull();
  });

  it("他人の写真ID は 404 (権限境界: receiver_id 一致のみ削除可能)", async () => {
    const me = await createEmulatorUser();
    await seedUser({ uid: me.uid, handle: "rcv_del_me" });
    await seedUser({ uid: "uid-otherd", handle: "rcv_del_other" });
    const others = await seedPhoto({
      receiverId: "uid-otherd",
      handle: "rcv_del_other",
      status: "completed",
    });

    const { status } = await apiJson<unknown>(`/receiver/photos/${others.photoId}`, {
      method: "DELETE",
      headers: authHeader(me.idToken),
    });
    expect(status).toBe(404);
  });
});
