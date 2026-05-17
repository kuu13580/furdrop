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
});
