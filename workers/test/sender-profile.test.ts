// GET /send/:handle (R02 受信者公開プロフィール)
// 対象: 認証不要のエンドポイント。Auth Emulator に依存しないので Phase 3 の起動検証も兼ねる。
import { describe, expect, it } from "vitest";
import { apiJson } from "./helpers/fetch";
import { seedUser } from "./helpers/seed";

describe("GET /send/:handle", () => {
  it("未登録ハンドルでは 404 NOT_FOUND を返す (公開プロフィールの存在確認)", async () => {
    const { status, body } = await apiJson<{ error: { code: string } }>("/send/nobody");
    expect(status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("受付中ユーザーでは is_accepting=true と埋め込みモードを返す (S01 ランディングで使う情報)", async () => {
    await seedUser({
      uid: "uid-active",
      handle: "active_user",
      display_name: "Active",
      exif_embed_mode: "required",
      watermark_mode: "optional",
    });
    const { status, body } = await apiJson<{
      receiver: {
        handle: string;
        display_name: string;
        is_accepting: boolean;
        options: { exif_embed_mode: string; watermark_mode: string };
      };
    }>("/send/active_user");
    expect(status).toBe(200);
    expect(body.receiver.handle).toBe("active_user");
    expect(body.receiver.display_name).toBe("Active");
    expect(body.receiver.is_accepting).toBe(true);
    expect(body.receiver.options.exif_embed_mode).toBe("required");
    expect(body.receiver.options.watermark_mode).toBe("optional");
  });

  it("受付停止中 (is_active=0) は is_accepting=false (送信者 UI で CTA を非活性にするための判定)", async () => {
    await seedUser({ uid: "uid-paused", handle: "paused_user", is_active: 0 });
    const { body } = await apiJson<{ receiver: { is_accepting: boolean } }>("/send/paused_user");
    expect(body.receiver.is_accepting).toBe(false);
  });

  it("クォータ満杯時も is_accepting=false (満杯 UI 切替の判定)", async () => {
    await seedUser({
      uid: "uid-full",
      handle: "full_user",
      storage_used: 10737418240,
      storage_quota: 10737418240,
    });
    const { body } = await apiJson<{ receiver: { is_accepting: boolean } }>("/send/full_user");
    expect(body.receiver.is_accepting).toBe(false);
  });
});
