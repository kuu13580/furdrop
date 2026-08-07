// GET /receiver/photos/:photoId/download (R05 オリジナル DL)
import { describe, expect, it } from "vitest";
import { authHeader, createEmulatorUser } from "./helpers/auth";
import { apiJson } from "./helpers/fetch";
import { seedPhoto, seedUser } from "./helpers/seed";

describe("GET /receiver/photos/:photoId/download", () => {
  it("download_url と命名規則に従った filename (YYYYMMDD-HHMMSS_NN.jpg) を返す", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "rcv_dl" });
    const photo = await seedPhoto({
      receiverId: uid,
      handle: "rcv_dl",
      status: "completed",
    });

    const { status, body } = await apiJson<{
      download_url: string;
      filename: string;
      file_size: number;
    }>(`/receiver/photos/${photo.photoId}/download`, { headers: authHeader(idToken) });

    expect(status).toBe(200);
    expect(body.download_url).toMatch(/^\/dev\/images\/originals\//); // dev モード
    expect(body.filename).toMatch(/^\d{8}-\d{6}_\d{2}\.jpg$/);
    expect(body.file_size).toBeGreaterThan(0);
  });

  // 目的: DL ファイル名の日時も受信者のタイムゾーン基準になること (JST 固定でない)
  it("tz_offset_min に応じて filename の日付が変わる", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "rcv_dl_tz" });
    const photo = await seedPhoto({
      receiverId: uid,
      handle: "rcv_dl_tz",
      status: "completed",
      createdAt: Date.UTC(2026, 0, 15, 20, 0, 0) / 1000,
    });

    const jst = await apiJson<{ filename: string }>(
      `/receiver/photos/${photo.photoId}/download?tz_offset_min=540`,
      { headers: authHeader(idToken) },
    );
    expect(jst.body.filename).toMatch(/^20260116-050000_\d{2}\.jpg$/);

    const hawaii = await apiJson<{ filename: string }>(
      `/receiver/photos/${photo.photoId}/download?tz_offset_min=-600`,
      { headers: authHeader(idToken) },
    );
    expect(hawaii.body.filename).toMatch(/^20260115-100000_\d{2}\.jpg$/);
  });
});
