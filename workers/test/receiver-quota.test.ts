// GET /receiver/quota (R07 ストレージ使用状況 + R13 削除予告のための expiring_soon)
import { describe, expect, it } from "vitest";
import { authHeader, createEmulatorUser } from "./helpers/auth";
import { apiJson } from "./helpers/fetch";
import { seedPhoto, seedUser } from "./helpers/seed";

const ONE_DAY = 24 * 3600;

type QuotaBody = {
  storage_used: number;
  photo_count: number;
  expiring_soon: { count: number; earliest_expires_at: number | null };
};

describe("GET /receiver/quota", () => {
  it("認証なしで叩くと 401 UNAUTHORIZED (権限境界)", async () => {
    const { status, body } = await apiJson<{ error: { code: string } }>("/receiver/quota");
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  // 予告バナー (60日窓) の母数。窓のすぐ内 (59日) とすぐ外 (61日) を置くことで、
  // EXPIRY_WARNING_SECONDS の取り違えを検出できるようにする。
  // 60日ちょうどは seed 〜 リクエスト間で now が進み判定が揺れるため境界値には使わない
  // (実装は `< now + 60日` の厳密不等号)。
  it("60日以内に期限を迎える写真だけが expiring_soon に数えられ、最も早い期限が返る (R13)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "rcv_quota" });
    const now = Math.floor(Date.now() / 1000);
    const soon = now + 10 * ONE_DAY;

    await seedPhoto({ receiverId: uid, handle: "rcv_quota", expiresAt: soon });
    await seedPhoto({ receiverId: uid, handle: "rcv_quota", expiresAt: now + 59 * ONE_DAY });
    await seedPhoto({ receiverId: uid, handle: "rcv_quota", expiresAt: now + 61 * ONE_DAY });

    const { status, body } = await apiJson<QuotaBody>("/receiver/quota", {
      headers: authHeader(idToken),
    });

    expect(status).toBe(200);
    expect(body.photo_count).toBe(3);
    expect(body.expiring_soon.count).toBe(2);
    expect(body.expiring_soon.earliest_expires_at).toBe(soon);
  });

  it("期限が遠い写真しかなければ expiring_soon は 0 / null になる", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "rcv_quota_far" });
    // 焼き込み済み (created_at + 180日) と旧データ (NULL → 同じ値に解決) の両方が窓の外
    await seedPhoto({ receiverId: uid, handle: "rcv_quota_far" });
    await seedPhoto({ receiverId: uid, handle: "rcv_quota_far", expiresAt: null });

    const { status, body } = await apiJson<QuotaBody>("/receiver/quota", {
      headers: authHeader(idToken),
    });

    expect(status).toBe(200);
    expect(body.expiring_soon.count).toBe(0);
    expect(body.expiring_soon.earliest_expires_at).toBeNull();
  });
});
