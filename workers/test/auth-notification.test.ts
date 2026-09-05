// 通知先メールアドレスの登録・検証・解除 (R09)
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { takeSentMails } from "../src/lib/mailer";
import { authHeader, createEmulatorUser } from "./helpers/auth";
import { apiFetch, apiJson } from "./helpers/fetch";
import { seedUser } from "./helpers/seed";

type UserBody = {
  user: {
    notification_email: string | null;
    pending_email: string | null;
    notify_digest: boolean;
    notify_expiry: boolean;
    notify_quota: boolean;
    locale: "ja" | "en" | null;
  };
};

/** 検証トークンはメールにしか出ないので、テストでは DB から取る */
async function pendingToken(uid: string): Promise<string> {
  const row = await env.DB.prepare(
    "SELECT pending_token FROM notification_settings WHERE receiver_id = ?",
  )
    .bind(uid)
    .first<{ pending_token: string }>();
  return row?.pending_token ?? "";
}

async function unsubToken(uid: string): Promise<string> {
  const row = await env.DB.prepare(
    "SELECT unsubscribe_token FROM notification_settings WHERE receiver_id = ?",
  )
    .bind(uid)
    .first<{ unsubscribe_token: string }>();
  return row?.unsubscribe_token ?? "";
}

beforeEach(() => {
  takeSentMails();
});

describe("通知先メールアドレスの登録と検証", () => {
  it("アドレスを登録すると検証待ちになり確認メールが飛ぶ (目的: 検証前に通知先として使われないこと)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "notif_a" });

    const res = await apiJson<UserBody>("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notification_email: "taro@example.com", locale: "ja" },
    });

    expect(res.status).toBe(200);
    // 検証が済むまで notification_email には入らない
    expect(res.body.user.notification_email).toBeNull();
    expect(res.body.user.pending_email).toBe("taro@example.com");
    // 既定は 3 種とも ON (アドレスを入れた = 受け取る意思表示)
    expect(res.body.user.notify_digest).toBe(true);
    expect(res.body.user.notify_expiry).toBe(true);
    expect(res.body.user.notify_quota).toBe(true);

    const mails = takeSentMails();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe("taro@example.com");
    // 購読前なので解除リンクは出さない
    expect(mails[0].headers?.["List-Unsubscribe"]).toBeUndefined();
  });

  it("確認リンクのトークンで検証すると通知先が確定する (目的: 認証なしでトークンだけで通ること)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "notif_b" });

    await apiJson("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notification_email: "hanako@example.com" },
    });

    const token = await pendingToken(uid);
    // メールアプリから踏む人はログインしていない = Authorization ヘッダ無しで通る
    const verified = await apiJson<{ email: string }>("/notifications/verify-email", {
      method: "POST",
      body: { token },
    });
    expect(verified.status).toBe(200);
    expect(verified.body.email).toBe("hanako@example.com");

    const me = await apiJson<UserBody>("/auth/me", { headers: authHeader(idToken) });
    expect(me.body.user.notification_email).toBe("hanako@example.com");
    expect(me.body.user.pending_email).toBeNull();
  });

  it("同じトークンは 2 回使えない (目的: 使い捨てであることの確認)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "notif_c" });
    await apiJson("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notification_email: "a@example.com" },
    });

    const token = await pendingToken(uid);
    expect(
      (await apiJson("/notifications/verify-email", { method: "POST", body: { token } })).status,
    ).toBe(200);
    expect(
      (await apiJson("/notifications/verify-email", { method: "POST", body: { token } })).status,
    ).toBe(404);
  });

  it("期限切れのトークンは 410 (目的: 打ち間違えた宛先で有効化される窓を閉じる)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "notif_d" });
    await apiJson("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notification_email: "b@example.com" },
    });

    await env.DB.prepare(
      "UPDATE notification_settings SET pending_expires = 1 WHERE receiver_id = ?",
    )
      .bind(uid)
      .run();

    const token = await pendingToken(uid);
    expect(
      (await apiJson("/notifications/verify-email", { method: "POST", body: { token } })).status,
    ).toBe(410);
  });

  it("アドレス変更中は検証済みの旧アドレスを保持する (目的: 変更で通知が黙って止まらないこと)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "notif_e" });

    await apiJson("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notification_email: "old@example.com" },
    });
    await apiJson("/notifications/verify-email", {
      method: "POST",
      body: { token: await pendingToken(uid) },
    });

    const res = await apiJson<UserBody>("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notification_email: "new@example.com" },
    });
    expect(res.body.user.notification_email).toBe("old@example.com");
    expect(res.body.user.pending_email).toBe("new@example.com");
  });

  it("null で通知先ごと解除できる", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "notif_f" });
    await apiJson("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notification_email: "c@example.com" },
    });
    await apiJson("/notifications/verify-email", {
      method: "POST",
      body: { token: await pendingToken(uid) },
    });

    const res = await apiJson<UserBody>("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notification_email: null },
    });
    expect(res.body.user.notification_email).toBeNull();
    expect(res.body.user.pending_email).toBeNull();
  });

  it("検証済みアドレスに戻すと検証待ちが取り消される (目的: 打ち間違え先の第三者が24時間トークンを踏めるのを塞ぐ)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "notif_cancel" });

    await apiJson("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notification_email: "good@example.com" },
    });
    await apiJson("/notifications/verify-email", {
      method: "POST",
      body: { token: await pendingToken(uid) },
    });

    // 打ち間違え
    await apiJson("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notification_email: "typo@examp1e.com" },
    });
    const strayToken = await pendingToken(uid);
    expect(strayToken).not.toBe("");

    // 気づいて元に戻す
    const res = await apiJson<UserBody>("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notification_email: "good@example.com" },
    });
    expect(res.body.user.pending_email).toBeNull();

    // 残っていたトークンはもう通らない
    const stray = await apiJson("/notifications/verify-email", {
      method: "POST",
      body: { token: strayToken },
    });
    expect(stray.status).toBe(404);
  });

  it("確認メールには日次の上限がある (目的: 1アカウントで任意の宛先へメール爆撃できないこと)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "notif_flood" });

    // 上限 5 通まで
    for (let i = 0; i < 5; i++) {
      const res = await apiJson("/auth/options", {
        method: "PATCH",
        headers: authHeader(idToken),
        body: { notification_email: `victim${i}@example.com` },
      });
      expect(res.status).toBe(200);
    }
    expect(takeSentMails()).toHaveLength(5);

    const over = await apiJson<{ error: { code: string } }>("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notification_email: "victim6@example.com" },
    });
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("RATE_LIMITED");
    expect(takeSentMails()).toHaveLength(0);
  });

  it("未登録ユーザーの通知設定 PATCH は 404 (目的: FK 違反の 500 にしない)", async () => {
    // users に行を作らない = Firebase 認証は通るが未登録
    const { idToken } = await createEmulatorUser();
    const res = await apiJson<{ error: { code: string } }>("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notify_digest: false },
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("メールアドレスの形式が不正なら 400 (目的: バウンス率を上げる宛先を弾く)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "notif_g" });
    const res = await apiJson("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notification_email: "not-an-email" },
    });
    expect(res.status).toBe(400);
  });

  it("通知の ON/OFF は種類ごとに独立して更新できる (PATCH セマンティクス)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "notif_h" });

    const res = await apiJson<UserBody>("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notify_digest: false },
    });
    expect(res.body.user.notify_digest).toBe(false);
    expect(res.body.user.notify_expiry).toBe(true);
    expect(res.body.user.notify_quota).toBe(true);
  });

  it("locale を保存して /auth/me に返す (目的: サーバーがメールの言語を決められること)", async () => {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle: "notif_i" });

    await apiJson("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { locale: "en" },
    });
    const me = await apiJson<UserBody>("/auth/me", { headers: authHeader(idToken) });
    expect(me.body.user.locale).toBe("en");
  });
});

describe("ワンクリック解除 (RFC 8058)", () => {
  async function verifiedUser(handle: string) {
    const { idToken, uid } = await createEmulatorUser();
    await seedUser({ uid, handle });
    await apiJson("/auth/options", {
      method: "PATCH",
      headers: authHeader(idToken),
      body: { notification_email: `${handle}@example.com` },
    });
    await apiJson("/notifications/verify-email", {
      method: "POST",
      body: { token: await pendingToken(uid) },
    });
    return { idToken, uid };
  }

  it("その種類だけを止め、他は残す (目的: ノイズ削減のついでに削除予告を失わせない)", async () => {
    const { idToken, uid } = await verifiedUser("unsub_a");
    const token = await unsubToken(uid);

    // メールクライアントは multipart で List-Unsubscribe=One-Click を POST してくる
    const res = await apiFetch(`/notifications/unsubscribe?t=${token}&k=digest`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    expect(res.status).toBe(200);

    const me = await apiJson<UserBody>("/auth/me", { headers: authHeader(idToken) });
    expect(me.body.user.notify_digest).toBe(false);
    expect(me.body.user.notify_expiry).toBe(true);
    expect(me.body.user.notify_quota).toBe(true);
  });

  it("不明なトークンでも 200 を返す (目的: 応答からトークンの有効性を推測させない)", async () => {
    const res = await apiFetch("/notifications/unsubscribe?t=nonexistent&k=digest", {
      method: "POST",
    });
    expect(res.status).toBe(200);
  });

  it("種類が不正なら 400", async () => {
    const res = await apiFetch("/notifications/unsubscribe?t=whatever&k=bogus", { method: "POST" });
    expect(res.status).toBe(400);
  });
});
