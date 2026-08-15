// GET /receiver/photos (R03 受信写真一覧 + R03a 日付/送信者別集計)
import { describe, expect, it } from "vitest";
import { authHeader, createEmulatorUser } from "./helpers/auth";
import { apiJson } from "./helpers/fetch";
import { seedPhoto, seedUser } from "./helpers/seed";

describe("GET /receiver/photos", () => {
  it("認証なしで叩くと 401 UNAUTHORIZED (権限境界)", async () => {
    const { status, body } = await apiJson<{ error: { code: string } }>("/receiver/photos");
    expect(status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("自分の completed 写真のみが返り、初回フェッチでは date_counts / sender_counts も非 null", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "rcv_basic" });
    await seedPhoto({
      receiverId: uid,
      handle: "rcv_basic",
      status: "completed",
      senderName: "@a",
    });
    await seedPhoto({
      receiverId: uid,
      handle: "rcv_basic",
      status: "completed",
      senderName: "@b",
    });
    await seedPhoto({ receiverId: uid, handle: "rcv_basic", status: "pending" }); // 含まれない

    const { status, body } = await apiJson<{
      photos: { id: string }[];
      total: number;
      date_counts: { key: string; count: number }[] | null;
      sender_counts: { key: string; count: number }[] | null;
    }>("/receiver/photos", { headers: authHeader(idToken) });

    expect(status).toBe(200);
    expect(body.photos).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.date_counts).not.toBeNull();
    expect(body.sender_counts).not.toBeNull();
    expect(body.sender_counts?.map((s) => s.key).sort()).toEqual(["@a", "@b"]);
  });

  // ギャラリーの「残りN日」バッジが使う値。旧データ (NULL) も実効値に解決して返す
  it("expires_at が実効値で返る。旧データ (NULL) は created_at + 180日 に解決される (R13)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "rcv_exp_list" });
    const createdAt = Math.floor(Date.now() / 1000) - 10 * 24 * 3600;
    await seedPhoto({ receiverId: uid, handle: "rcv_exp_list", createdAt, expiresAt: null });

    const { status, body } = await apiJson<{ photos: { expires_at: number }[] }>(
      "/receiver/photos",
      { headers: authHeader(idToken) },
    );

    expect(status).toBe(200);
    expect(body.photos[0].expires_at).toBe(createdAt + 180 * 24 * 3600);
  });

  it("他人の写真は返らない (権限境界: receiver_id が UID 一致のみ)", async () => {
    const me = await createEmulatorUser();
    await seedUser({ uid: me.uid, handle: "rcv_mine" });
    await seedPhoto({ receiverId: me.uid, handle: "rcv_mine", status: "completed" });

    await seedUser({ uid: "uid-other", handle: "rcv_other" });
    await seedPhoto({ receiverId: "uid-other", handle: "rcv_other", status: "completed" });
    await seedPhoto({ receiverId: "uid-other", handle: "rcv_other", status: "completed" });

    const { body } = await apiJson<{ total: number }>("/receiver/photos", {
      headers: authHeader(me.idToken),
    });
    expect(body.total).toBe(1); // 自分の 1 件のみ
  });

  it("limit を超える枚数では next_cursor が非 null になり、後続ページで集計フィールドが null になる", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "rcv_page" });
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 5; i++) {
      // created_at をずらすことで ORDER BY が安定
      await seedPhoto({
        receiverId: uid,
        handle: "rcv_page",
        status: "completed",
        createdAt: now - i,
      });
    }

    const first = await apiJson<{
      photos: { id: string }[];
      next_cursor: string | null;
      date_counts: unknown;
    }>("/receiver/photos?limit=2", { headers: authHeader(idToken) });
    expect(first.body.photos).toHaveLength(2);
    expect(first.body.next_cursor).not.toBeNull();
    expect(first.body.date_counts).not.toBeNull();

    const cursor = first.body.next_cursor;
    if (cursor === null) throw new Error("unreachable: next_cursor が null"); // 直前の expect で確認済み、型ナローイング用
    const second = await apiJson<{
      photos: { id: string }[];
      date_counts: unknown;
    }>(`/receiver/photos?limit=2&cursor=${encodeURIComponent(cursor)}`, {
      headers: authHeader(idToken),
    });
    expect(second.body.photos).toHaveLength(2);
    expect(second.body.date_counts).toBeNull(); // 後続ページは集計を省略
  });

  // 目的: 海外の受信者が「JST の日付見出し」を見せられないこと。
  // date_counts の日境界はクライアントが送る tz_offset_min で切られる。
  it("tz_offset_min のタイムゾーンで date_counts の日境界が切られる", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "rcv_tz" });
    // 2026-01-15 20:00 UTC — JST(+540) では 01-16、ハワイ(-600) では 01-15
    await seedPhoto({
      receiverId: uid,
      handle: "rcv_tz",
      status: "completed",
      createdAt: Date.UTC(2026, 0, 15, 20, 0, 0) / 1000,
    });

    const jst = await apiJson<{ date_counts: { key: string }[] }>(
      "/receiver/photos?tz_offset_min=540",
      { headers: authHeader(idToken) },
    );
    expect(jst.body.date_counts[0].key).toBe("2026-01-16");

    const hawaii = await apiJson<{ date_counts: { key: string }[] }>(
      "/receiver/photos?tz_offset_min=-600",
      { headers: authHeader(idToken) },
    );
    expect(hawaii.body.date_counts[0].key).toBe("2026-01-15");
  });

  it("tz_offset_min 未指定では従来どおり JST (+540) で集計する (後方互換)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "rcv_tz_def" });
    await seedPhoto({
      receiverId: uid,
      handle: "rcv_tz_def",
      status: "completed",
      createdAt: Date.UTC(2026, 0, 15, 20, 0, 0) / 1000,
    });

    const { body } = await apiJson<{ date_counts: { key: string }[] }>("/receiver/photos", {
      headers: authHeader(idToken),
    });
    expect(body.date_counts[0].key).toBe("2026-01-16");
  });

  // 目的: zod バリデーション失敗も共通エラー形式 (defaultHook) で返ること。
  // これが素通りするとクライアントの resolveApiError が code を拾えない。
  it("不正なクエリは { error: { code: INVALID_REQUEST } } 形式の 400 を返す", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "rcv_badq" });

    const { status, body } = await apiJson<{ error: { code: string; message: string } }>(
      "/receiver/photos?limit=9999",
      { headers: authHeader(idToken) },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.error.message).toBeTruthy();
  });

  it("範囲外の tz_offset_min は 400 で弾く (実在しないオフセット)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "rcv_tz_range" });

    const { status, body } = await apiJson<{ error: { code: string } }>(
      "/receiver/photos?tz_offset_min=9999",
      { headers: authHeader(idToken) },
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("tz_offset_min が値なし (?tz_offset_min=) でも UTC ではなく既定の JST に落ちる", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "rcv_tz_empty" });
    await seedPhoto({
      receiverId: uid,
      handle: "rcv_tz_empty",
      status: "completed",
      createdAt: Date.UTC(2026, 0, 15, 20, 0, 0) / 1000,
    });

    const { body } = await apiJson<{ date_counts: { key: string }[] }>(
      "/receiver/photos?tz_offset_min=",
      { headers: authHeader(idToken) },
    );
    expect(body.date_counts[0].key).toBe("2026-01-16"); // UTC(0) なら 01-15 になる
  });
});
