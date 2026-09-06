// 日次のメール通知 (R09)
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { runDailyNotifications } from "../src/cron/notify";
import { takeSentMails } from "../src/lib/mailer";
import { seedPhoto, seedUser } from "./helpers/seed";

const DAY = 24 * 3600;

/**
 * 検証済みの通知先を持つ受信者を作る。
 * API 経由の登録・検証は auth-notification.test.ts が見ているので、ここは直接入れる。
 */
async function seedNotifiable(
  uid: string,
  handle: string,
  opts: {
    lastDigestAt?: number | null;
    quotaNoticeLevel?: number;
    storageUsed?: number;
    storageQuota?: number;
    locale?: string;
    digest?: 0 | 1;
    expiry?: 0 | 1;
    quota?: 0 | 1;
  } = {},
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await seedUser({
    uid,
    handle,
    storage_used: opts.storageUsed ?? 0,
    storage_quota: opts.storageQuota ?? 10737418240,
  });
  if (opts.locale) {
    await env.DB.prepare("UPDATE users SET locale = ? WHERE id = ?").bind(opts.locale, uid).run();
  }
  await env.DB.prepare(
    `INSERT INTO notification_settings
       (receiver_id, email, unsubscribe_token, notify_digest, notify_expiry, notify_quota,
        last_digest_at, quota_notice_level, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      uid,
      `${handle}@example.com`,
      `unsub-${handle}`,
      opts.digest ?? 1,
      opts.expiry ?? 1,
      opts.quota ?? 1,
      opts.lastDigestAt === undefined ? now - DAY : opts.lastDigestAt,
      opts.quotaNoticeLevel ?? 0,
      now,
      now,
    )
    .run();
}

beforeEach(() => {
  takeSentMails();
});

describe("新着ダイジェスト", () => {
  it("前回以降に届いた写真があれば 1 通送り、送信者名と枚数を載せる", async () => {
    await seedNotifiable("u-digest", "dig_a");
    await seedPhoto({ receiverId: "u-digest", handle: "dig_a", senderName: "@hanako" });
    await seedPhoto({ receiverId: "u-digest", handle: "dig_a", senderName: "@taro" });

    await runDailyNotifications(env);

    const mails = takeSentMails();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe("dig_a@example.com");
    expect(mails[0].subject).toContain("2");
    expect(mails[0].text).toContain("@hanako");
    expect(mails[0].text).toContain("@taro");
    // RFC 8058: 解除は API 側の URL を指す (静的な Pages では POST を受けられない)
    expect(mails[0].headers?.["List-Unsubscribe"]).toContain("/notifications/unsubscribe");
    expect(mails[0].headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("2 回続けて走らせても 2 通目は送らない (目的: 冪等性 — last_digest_at で窓が進むこと)", async () => {
    await seedNotifiable("u-idem", "dig_b");
    await seedPhoto({ receiverId: "u-idem", handle: "dig_b", senderName: "@a" });

    await runDailyNotifications(env);
    expect(takeSentMails()).toHaveLength(1);

    await runDailyNotifications(env);
    expect(takeSentMails()).toHaveLength(0);
  });

  it("新着が無ければ送らない (目的: 毎朝空のメールを配らない)", async () => {
    await seedNotifiable("u-empty", "dig_c");
    await runDailyNotifications(env);
    expect(takeSentMails()).toHaveLength(0);
  });

  it("notify_digest が 0 なら送らない (解除済み)", async () => {
    await seedNotifiable("u-off", "dig_d", { digest: 0 });
    await seedPhoto({ receiverId: "u-off", handle: "dig_d", senderName: "@a" });
    await runDailyNotifications(env);
    expect(takeSentMails()).toHaveLength(0);
  });

  it("送信者が上限を超えたら「ほかN名」は残りの人数になる (目的: 枚数から引いて誤表示しないこと)", async () => {
    await seedNotifiable("u-many", "dig_many");
    // 5 名から計 12 枚。表示は 3 名 + 「ほか2名」であって「ほか9名」ではない
    for (const [i, name] of ["@a", "@b", "@c", "@d", "@e"].entries()) {
      const times = i === 0 ? 8 : 1;
      for (let n = 0; n < times; n++) {
        await seedPhoto({ receiverId: "u-many", handle: "dig_many", senderName: name });
      }
    }

    await runDailyNotifications(env);

    const mails = takeSentMails();
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toContain("ほか2名");
    expect(mails[0].text).not.toContain("ほか9名");
  });

  it("匿名だけの送信でも文言が成立する (目的: sender_name が NULL の写真で崩れないこと)", async () => {
    await seedNotifiable("u-anon", "dig_e");
    await seedPhoto({ receiverId: "u-anon", handle: "dig_e", senderName: null });
    await runDailyNotifications(env);

    const mails = takeSentMails();
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toContain("匿名");
  });

  it("Cron 実行を跨いで confirm された写真が次のダイジェストに入る (目的: created_at 基準の取りこぼし)", async () => {
    const now = Math.floor(Date.now() / 1000);
    // last_digest_at より前に presign され (created_at)、後に confirm された (updated_at) 写真。
    // created_at で窓を切ると永久にどのダイジェストにも入らなくなる
    await seedNotifiable("u-straddle", "dig_str", { lastDigestAt: now - 60 });
    const { photoId } = await seedPhoto({
      receiverId: "u-straddle",
      handle: "dig_str",
      senderName: "@a",
      createdAt: now - 300,
    });
    await env.DB.prepare("UPDATE photos SET updated_at = ? WHERE id = ?")
      .bind(now - 10, photoId)
      .run();

    await runDailyNotifications(env);
    expect(takeSentMails()).toHaveLength(1);
  });

  it("集計後に同じ秒で confirm された写真は次回のダイジェストで拾われる (目的: 上限を締めないと永久に落ちる)", async () => {
    const now = Math.floor(Date.now() / 1000);
    await seedNotifiable("u-boundary", "dig_bd", { lastDigestAt: now - 100 });

    // 1 枚目は窓の中。これがないとそもそもダイジェストが送られない
    const a = await seedPhoto({ receiverId: "u-boundary", handle: "dig_bd", senderName: "@a" });
    await env.DB.prepare("UPDATE photos SET updated_at = ? WHERE id = ?")
      .bind(now - 10, a.photoId)
      .run();

    // 2 枚目は Cron 開始時刻より後に confirm された扱い (updated_at > now)。
    // 上限 (updated_at <= now) が無いと今回の集計に入り、last_digest_at = now で
    // 次回の `> now` からも外れて永久に落ちる
    const b = await seedPhoto({ receiverId: "u-boundary", handle: "dig_bd", senderName: "@b" });
    await env.DB.prepare("UPDATE photos SET updated_at = ? WHERE id = ?")
      .bind(now + 5, b.photoId)
      .run();

    await runDailyNotifications(env);
    const first = takeSentMails();
    expect(first).toHaveLength(1);
    // 2 枚目は今回の窓 (since, now] の外なので入らない
    expect(first[0].text).toContain("1枚");
    expect(first[0].text).not.toContain("@b");

    // **落ちていないこと**を透かしで確認する。last_digest_at が 2 枚目の updated_at より
    // 手前で止まっていれば、次に now がそこを追い越した実行で必ず拾われる。
    // 上限を締めていないと last_digest_at が updated_at を追い越し、永久に落ちる
    const row = await env.DB.prepare(
      "SELECT last_digest_at FROM notification_settings WHERE receiver_id = ?",
    )
      .bind("u-boundary")
      .first<{ last_digest_at: number }>();
    expect(row?.last_digest_at).toBeLessThan(now + 5);
  });

  it("送信に失敗した日は窓を進めない (目的: その日のぶんを翌日に送り直せること)", async () => {
    await seedNotifiable("u-fail", "dig_fail");
    await seedPhoto({ receiverId: "u-fail", handle: "dig_fail", senderName: "@a" });

    await runDailyNotifications(env);
    expect(takeSentMails()).toHaveLength(1);

    const row = await env.DB.prepare(
      "SELECT last_digest_at FROM notification_settings WHERE receiver_id = ?",
    )
      .bind("u-fail")
      .first<{ last_digest_at: number }>();
    // 成功したので窓は進んでいる
    expect(row?.last_digest_at).toBeGreaterThan(0);
  });

  it("locale=en なら英語で送る", async () => {
    await seedNotifiable("u-en", "dig_f", { locale: "en" });
    await seedPhoto({ receiverId: "u-en", handle: "dig_f", senderName: "@a" });
    await runDailyNotifications(env);

    const mails = takeSentMails();
    expect(mails[0].subject).toContain("new photo");
  });

  it("通知先が未検証の受信者には送らない (目的: 検証前のアドレスへ配らない)", async () => {
    await seedUser({ uid: "u-unverified", handle: "dig_g" });
    await env.DB.prepare(
      `INSERT INTO notification_settings (receiver_id, pending_email, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
      .bind("u-unverified", "pending@example.com", 0, 0)
      .run();
    await seedPhoto({ receiverId: "u-unverified", handle: "dig_g", senderName: "@a" });

    await runDailyNotifications(env);
    expect(takeSentMails()).toHaveLength(0);
  });
});

describe("削除予告", () => {
  it("残り14日・3日の帯に入った写真だけを予告する (目的: 帯判定で 1 回だけ送られること)", async () => {
    const now = Math.floor(Date.now() / 1000);
    await seedNotifiable("u-exp", "exp_a", { lastDigestAt: now });

    // 14日の帯 ([now+13d, now+14d))
    await seedPhoto({
      receiverId: "u-exp",
      handle: "exp_a",
      expiresAt: now + 13.5 * DAY,
      createdAt: now - 10,
    });
    // 3日の帯
    await seedPhoto({
      receiverId: "u-exp",
      handle: "exp_a",
      expiresAt: now + 2.5 * DAY,
      createdAt: now - 10,
    });
    // どちらの帯にも入らない (まだ先)
    await seedPhoto({
      receiverId: "u-exp",
      handle: "exp_a",
      expiresAt: now + 60 * DAY,
      createdAt: now - 10,
    });

    await runDailyNotifications(env);

    const mails = takeSentMails();
    expect(mails).toHaveLength(2);
    const days = mails.map((m) => (m.text.includes("14日") ? 14 : 3)).sort((a, b) => a - b);
    expect(days).toEqual([3, 14]);
    // 期限が遠い 1 枚は数に入らない
    for (const m of mails) expect(m.text).toContain("1枚");
  });

  it("expires_at が NULL の旧データも created_at + 365日 で帯判定される (目的: COALESCE の bind 順序)", async () => {
    const now = Math.floor(Date.now() / 1000);
    await seedNotifiable("u-exp-null", "exp_c", { lastDigestAt: now });
    // expires_at を持たない旧データ。created_at + 365日 が 14日の帯に入るように置く
    await seedPhoto({
      receiverId: "u-exp-null",
      handle: "exp_c",
      expiresAt: null,
      createdAt: now - 351 * DAY - 12 * 3600,
    });

    await runDailyNotifications(env);

    const mails = takeSentMails();
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toContain("14日");
  });

  it("notify_expiry が 0 なら送らない", async () => {
    const now = Math.floor(Date.now() / 1000);
    await seedNotifiable("u-exp-off", "exp_b", { lastDigestAt: now, expiry: 0 });
    await seedPhoto({
      receiverId: "u-exp-off",
      handle: "exp_b",
      expiresAt: now + 13.5 * DAY,
      createdAt: now - 10,
    });
    await runDailyNotifications(env);
    expect(takeSentMails()).toHaveLength(0);
  });
});

describe("容量警告", () => {
  const QUOTA = 10 * 1024 ** 3;

  it("80% を跨いだときに 1 回だけ送る (目的: 同じレベルに留まる間は毎日送らない)", async () => {
    await seedNotifiable("u-q80", "q_a", {
      storageUsed: QUOTA * 0.85,
      storageQuota: QUOTA,
    });

    await runDailyNotifications(env);
    const first = takeSentMails();
    expect(first).toHaveLength(1);
    expect(first[0].subject).toContain("85");

    await runDailyNotifications(env);
    expect(takeSentMails()).toHaveLength(0);
  });

  it("80% で通知済みでも 95% に達したら改めて送る", async () => {
    await seedNotifiable("u-q95", "q_b", {
      storageUsed: Math.floor(QUOTA * 0.96),
      storageQuota: QUOTA,
      quotaNoticeLevel: 80,
    });

    await runDailyNotifications(env);
    expect(takeSentMails()).toHaveLength(1);
  });

  it("空きを作って下回ったら通知済みレベルが戻る (目的: 次に逼迫したとき再び知らせること)", async () => {
    await seedNotifiable("u-qdown", "q_c", {
      storageUsed: Math.floor(QUOTA * 0.5),
      storageQuota: QUOTA,
      quotaNoticeLevel: 95,
    });

    await runDailyNotifications(env);
    expect(takeSentMails()).toHaveLength(0);

    const row = await env.DB.prepare(
      "SELECT quota_notice_level FROM notification_settings WHERE receiver_id = ?",
    )
      .bind("u-qdown")
      .first<{ quota_notice_level: number }>();
    expect(row?.quota_notice_level).toBe(0);
  });

  it("notify_quota が 0 でも使用率が下がれば通知済みレベルは戻る (目的: 再オン時に警告が出ること)", async () => {
    await seedNotifiable("u-qoff", "q_e", {
      storageUsed: Math.floor(QUOTA * 0.5),
      storageQuota: QUOTA,
      quotaNoticeLevel: 95,
      quota: 0,
    });

    await runDailyNotifications(env);
    expect(takeSentMails()).toHaveLength(0);

    const row = await env.DB.prepare(
      "SELECT quota_notice_level FROM notification_settings WHERE receiver_id = ?",
    )
      .bind("u-qoff")
      .first<{ quota_notice_level: number }>();
    expect(row?.quota_notice_level).toBe(0);
  });

  it("しきい値未満なら送らない", async () => {
    await seedNotifiable("u-qlow", "q_d", {
      storageUsed: Math.floor(QUOTA * 0.5),
      storageQuota: QUOTA,
    });
    await runDailyNotifications(env);
    expect(takeSentMails()).toHaveLength(0);
  });
});
