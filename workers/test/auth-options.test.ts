// PATCH /auth/options (R14 受信オプション更新)
import { describe, expect, it } from "vitest";
import { authHeader, createEmulatorUser } from "./helpers/auth";
import { apiJson } from "./helpers/fetch";
import { seedUser } from "./helpers/seed";

describe("PATCH /auth/options", () => {
  it("exif_embed_mode を required に更新すると /send/:handle のレスポンスに即座に反映される (R14: 送信者 UI の強制 ON 判定)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "alice_opts", exif_embed_mode: "optional" });

    const updated = await apiJson<{ user: { exif_embed_mode: string } }>("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { exif_embed_mode: "required" },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.user.exif_embed_mode).toBe("required");

    const profile = await apiJson<{
      receiver: { options: { exif_embed_mode: string } };
    }>("/send/alice_opts");
    expect(profile.body.receiver.options.exif_embed_mode).toBe("required");
  });

  it("require_sender_name を更新すると /auth/options のレスポンスと /send/:handle の options に反映される (R14 名前必須設定)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "carol_opts" });

    const updated = await apiJson<{ user: { require_sender_name: boolean } }>("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { require_sender_name: true },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.user.require_sender_name).toBe(true);

    const profile = await apiJson<{
      receiver: { options: { require_sender_name: boolean } };
    }>("/send/carol_opts");
    expect(profile.body.receiver.options.require_sender_name).toBe(true);
  });

  it("PATCH なので未指定フィールドは既存値が維持される (PUT セマンティクスではない)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({
      uid,
      handle: "bob_opts",
      exif_embed_mode: "required",
      watermark_mode: "optional",
    });
    const updated = await apiJson<{
      user: { exif_embed_mode: string; watermark_mode: string };
    }>("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { watermark_mode: "disabled" }, // exif_embed_mode は省略
    });
    expect(updated.body.user.exif_embed_mode).toBe("required"); // 維持
    expect(updated.body.user.watermark_mode).toBe("disabled"); // 更新
  });

  it("require_send_key を false にすると receive_url から ?k= が落ちる (R16 opt-out)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "dave_opts" });

    const before = await apiJson<{ user: { receive_url: string; require_send_key: boolean } }>(
      "/auth/me",
      { headers: authHeader(idToken) },
    );
    expect(before.body.user.require_send_key).toBe(true);
    expect(before.body.user.receive_url).toContain("?k=");

    const off = await apiJson<{ user: { receive_url: string; require_send_key: boolean } }>(
      "/auth/options",
      { method: "PATCH", headers: authHeader(idToken), body: { require_send_key: false } },
    );
    expect(off.body.user.require_send_key).toBe(false);
    expect(off.body.user.receive_url).toBe("/send/dave_opts");

    // send_keys は消さないので、戻せば同じ URL が復活する
    const on = await apiJson<{ user: { receive_url: string } }>("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { require_send_key: true },
    });
    expect(on.body.user.receive_url).toBe(before.body.user.receive_url);
  });

  it("is_active を false にすると /send/:handle の is_accepting が false になる (R11 受付停止)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "erin_opts" });

    const updated = await apiJson<{ user: { is_active: boolean } }>("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { is_active: false },
    });
    expect(updated.body.user.is_active).toBe(false);

    const profile = await apiJson<{ receiver: { is_accepting: boolean } }>("/send/erin_opts");
    expect(profile.body.receiver.is_accepting).toBe(false);
  });
});
