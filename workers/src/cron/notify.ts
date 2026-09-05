/**
 * 日次のメール通知 (R09)。UTC 0:00 = JST 9:00 に 1 回だけ走る。
 *
 * 受信者への予告チャネルが「ログインしたときに画面で気づく」しかなかった状態を解消する
 * のが目的。届かなくても写真は失われないので、1 通の失敗で全体を止めない
 * (runCleanup と同じく各ステップを個別に握って続行する)。
 */
import { renderEmail } from "../lib/email-templates";
import { logError } from "../lib/logger";
import { sendMail } from "../lib/mailer";
import { type NotifyKind, notificationLinks, resolveLocale } from "../lib/notification";
import { EFFECTIVE_EXPIRES_AT, PHOTO_RETENTION_SECONDS } from "../lib/retention";
import type { Env } from "../types";

/** メールで予告する残り日数。画面のバナー (30日) より短い — メールは行動できる距離で送る */
export const EXPIRY_NOTICE_DAYS = [14, 3] as const;

/** 容量警告を送るしきい値 (%)。ダッシュボードのバナーと揃える */
const QUOTA_LEVELS = [95, 80] as const;

/** リード行に並べる送信者名の上限。超えたぶんは「ほかN名」に畳む */
const MAX_SENDER_NAMES = 3;

const DAY = 24 * 3600;

/**
 * ダイジェストの遡りの上限。
 *
 * 送信に失敗した日は窓を進めないので翌日にまとめて送るが、宛先が恒久的に落ちている場合に
 * 件数が際限なく積み上がるのを防ぐ。
 */
const DIGEST_MAX_LOOKBACK = 7 * DAY;

/**
 * 通知を設定済みの受信者。notification_settings に行があるユーザーだけが対象になるので、
 * このテーブルを読むこと自体が絞り込みになっている。
 */
interface Target {
  receiver_id: string;
  email: string;
  unsubscribe_token: string;
  locale: string | null;
  notify_digest: number;
  notify_expiry: number;
  notify_quota: number;
  last_digest_at: number | null;
  quota_notice_level: number;
  storage_used: number;
  storage_quota: number;
}

const TARGET_SQL = `
  SELECT n.receiver_id, n.email, n.unsubscribe_token, u.locale,
         n.notify_digest, n.notify_expiry, n.notify_quota,
         n.last_digest_at, n.quota_notice_level,
         u.storage_used, u.storage_quota
    FROM notification_settings n
    JOIN users u ON u.id = n.receiver_id
   WHERE n.email IS NOT NULL AND n.unsubscribe_token IS NOT NULL`;

export async function runDailyNotifications(env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const { results } = await env.DB.prepare(TARGET_SQL).all<Target>();
  const targets = results ?? [];

  const steps: [string, () => Promise<void>][] = [
    ["digest", () => sendDigests(env, targets, now)],
    ["expiry", () => sendExpiryNotices(env, targets, now)],
    ["quota", () => sendQuotaNotices(env, targets)],
  ];

  let failedSteps = 0;
  for (const [name, fn] of steps) {
    try {
      await fn();
    } catch (err) {
      failedSteps++;
      logError("notify-step", err, { step: name });
    }
  }

  if (failedSteps > 0) {
    throw new Error(
      `daily notifications finished with ${failedSteps}/${steps.length} failed step(s)`,
    );
  }
}

/** 1 通ぶんを組み立てて送る。テンプレートの変数は呼び出し側が用意する */
async function send(
  env: Env,
  target: Target,
  kind: NotifyKind,
  type: "digest" | "expiry" | "quota",
  vars: Record<string, string | number>,
): Promise<boolean> {
  const links = notificationLinks(env, target.unsubscribe_token, kind);
  const mail = renderEmail(type, resolveLocale(target.locale), { ...links.vars, ...vars });
  return sendMail(env, { to: target.email, ...mail, headers: links.headers });
}

// ========== 新着ダイジェスト ==========

/**
 * 窓は `created_at` ではなく **`updated_at`** で切る。
 *
 * `photos.created_at` は presigned URL の発行時刻で、`completed` になるのは最大 15 分後の
 * confirm 時。`created_at` で切ると、Cron の実行時刻 (JST 9:00) を跨いだアップロードが
 * 「前回の窓より古いが、前回の実行時点ではまだ pending」となり、**永久にどのダイジェストにも
 * 入らなくなる**。`photos.updated_at` を書くのは confirm (→completed) と
 * cleanup (→failed) の 2 箇所だけなので、completed 写真の `updated_at` = confirm 時刻。
 */
const DIGEST_WHERE = `receiver_id = ? AND upload_status = 'completed' AND updated_at > ?`;
const DIGEST_COUNT_SQL = `SELECT COUNT(*) AS count FROM photos WHERE ${DIGEST_WHERE}`;

async function sendDigests(env: Env, targets: Target[], now: number): Promise<void> {
  for (const t of targets) {
    if (!t.notify_digest) continue;

    // last_digest_at は検証成立時に打たれる。NULL は理屈上ありえないが、
    // 万一 NULL なら「過去すべて」ではなく直近 1 日に閉じる
    const since = Math.max(t.last_digest_at ?? now - DAY, now - DIGEST_MAX_LOOKBACK);

    const row = await env.DB.prepare(DIGEST_COUNT_SQL)
      .bind(t.receiver_id, since)
      .first<{ count: number }>();

    const count = row?.count ?? 0;
    if (count === 0) continue;

    const senders = await senderPhrase(env, t, since);
    const sent = await send(env, t, "digest", "digest", { count, senders });

    // 送れなかった日は窓を進めない (翌日にまとめて送る)。際限なく積み上がらないよう
    // 遡りは DIGEST_MAX_LOOKBACK で頭打ちにしてある
    if (!sent) continue;

    await env.DB.prepare(
      "UPDATE notification_settings SET last_digest_at = ?, updated_at = ? WHERE receiver_id = ?",
    )
      .bind(now, now, t.receiver_id)
      .run();
  }
}

/**
 * 「@a、@b、ほか1名」のような送信者の並び。
 *
 * 送信者名は送信者が自由に入れたテキストなので、**改行を潰してから使う**。
 * 改行が残ると email-layout の段落分割にかかってリード行が割れる
 * (HTML エスケープは別途かかるので、崩れるのは体裁だけ)。
 */
async function senderPhrase(env: Env, target: Target, since: number): Promise<string> {
  const named = `${DIGEST_WHERE} AND sender_name IS NOT NULL AND sender_name <> ''`;
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT sender_name FROM photos WHERE ${named} ORDER BY sender_name LIMIT ?`,
  )
    .bind(target.receiver_id, since, MAX_SENDER_NAMES + 1)
    .all<{ sender_name: string }>();

  const ja = resolveLocale(target.locale) === "ja";
  const names = (results ?? [])
    .map((r) => r.sender_name.replace(/\s+/g, " ").trim())
    .filter((n) => n !== "");

  if (names.length === 0) return ja ? "匿名の送信者" : "anonymous senders";
  if (names.length <= MAX_SENDER_NAMES) return ja ? names.join("、") : joinEn(names);

  // 上限を超えたときだけ、残りの**人数**を出すために総数を引く。
  // 写真の枚数から引くと「4名から10枚」で「ほか7名」になってしまう
  const row = await env.DB.prepare(
    `SELECT COUNT(DISTINCT sender_name) AS count FROM photos WHERE ${named}`,
  )
    .bind(target.receiver_id, since)
    .first<{ count: number }>();

  const shown = names.slice(0, MAX_SENDER_NAMES);
  const rest = Math.max(1, (row?.count ?? names.length) - shown.length);
  return ja ? `${shown.join("、")}、ほか${rest}名` : `${shown.join(", ")} and ${rest} others`;
}

function joinEn(names: string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// ========== 削除予告 ==========

/**
 * 残り日数の「帯」で判定する。日次実行なので、各写真はどちらの帯にもちょうど 1 回だけ入る。
 * 写真ごとの送信済みフラグを持たずに冪等性が出せる。
 *
 * 引き換えに、Cron が 1 回飛ぶとその日のぶんは送られない。14日と3日の 2 回に加えて
 * 画面のバナー (30日) もあるので、気づく機会は 3 つある。
 */
async function sendExpiryNotices(env: Env, targets: Target[], now: number): Promise<void> {
  for (const t of targets) {
    if (!t.notify_expiry) continue;

    for (const days of EXPIRY_NOTICE_DAYS) {
      const from = now + (days - 1) * DAY;
      const to = now + days * DAY;

      const row = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM photos
          WHERE receiver_id = ? AND upload_status = 'completed'
            AND ${EFFECTIVE_EXPIRES_AT} >= ? AND ${EFFECTIVE_EXPIRES_AT} < ?`,
      )
        .bind(t.receiver_id, PHOTO_RETENTION_SECONDS, from, PHOTO_RETENTION_SECONDS, to)
        .first<{ count: number }>();

      const count = row?.count ?? 0;
      if (count === 0) continue;

      await send(env, t, "expiry", "expiry", { count, days });
    }
  }
}

// ========== 容量警告 ==========

/**
 * しきい値を「跨いだ」ときだけ送る。
 *
 * 設定 (notify_quota) と状態 (quota_notice_level) を別カラムに分けているのは、
 * 同じカラムに畳むと通知をオフにした時点で「どこまで通知したか」が消え、
 * オンに戻した瞬間に同じ警告がもう一度飛ぶため。
 */
async function sendQuotaNotices(env: Env, targets: Target[]): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  for (const t of targets) {
    if (t.storage_quota <= 0) continue;

    const percent = Math.floor((t.storage_used / t.storage_quota) * 100);
    const level = QUOTA_LEVELS.find((l) => percent >= l) ?? 0;

    // 下がったら通知済みレベルを戻す。写真を消して空けたあと、また 80% に達したら
    // 改めて知らせる必要がある。
    // **これは notify_quota が 0 でも行う** — オフの間に使用率が下がったのにレベルが
    // 高いまま残ると、オンに戻して再び逼迫しても警告が飛ばなくなる
    if (level < t.quota_notice_level) {
      await env.DB.prepare(
        "UPDATE notification_settings SET quota_notice_level = ?, updated_at = ? WHERE receiver_id = ?",
      )
        .bind(level, now, t.receiver_id)
        .run();
      continue;
    }

    if (!t.notify_quota) continue;
    if (level <= t.quota_notice_level) continue;

    await send(env, t, "quota", "quota", {
      percent,
      used: formatBytes(t.storage_used),
      quota: formatBytes(t.storage_quota),
    });

    await env.DB.prepare(
      "UPDATE notification_settings SET quota_notice_level = ?, updated_at = ? WHERE receiver_id = ?",
    )
      .bind(level, now, t.receiver_id)
      .run();
  }
}

/** メール本文用。UI 側の表示と桁を揃える (小数第1位まで) */
export function formatBytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${Math.round(gb * 10) / 10} GB`;
  const mb = bytes / 1024 ** 2;
  return `${Math.round(mb * 10) / 10} MB`;
}
