// GET /auth/me (S05 ログイン後の登録判定 / S06 ダッシュボード初期データ取得)
import { describe, expect, it } from "vitest";
import { authHeader, createEmulatorUser } from "./helpers/auth";
import { apiJson } from "./helpers/fetch";
import { seedUser } from "./helpers/seed";

describe("GET /auth/me", () => {
  it("未登録 UID では 404 NOT_FOUND を返す (登録画面への遷移を促すための判定)", async () => {
    const { idToken } = await createEmulatorUser();
    const { status, body } = await apiJson<{ error: { code: string } }>("/auth/me", {
      headers: authHeader(idToken),
    });
    expect(status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("登録済み UID では user 情報と receive_url (?k= 付き) を返す (R16: ダッシュボードの公開URL表示用)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    const seeded = await seedUser({ uid, handle: "taro_camera", display_name: "Taro" });

    const { status, body } = await apiJson<{
      user: { id: string; handle: string; display_name: string; receive_url: string };
    }>("/auth/me", { headers: authHeader(idToken) });

    expect(status).toBe(200);
    expect(body.user.id).toBe(uid);
    expect(body.user.handle).toBe("taro_camera");
    expect(body.user.receive_url).toBe(`/send/taro_camera?k=${seeded.sendKey}`);
  });
});
