/**
 * 通知設定 (R09) の読み書きと、通知先メールアドレスの検証フロー。
 *
 * 行は遅延生成する。「行が無い = 通知を一度も設定していない」なので、日次 Cron は
 * このテーブルを読むこと自体が絞り込みになる。
 */

import type { Env } from "../types";
import { asBool } from "./d1";
import { type EmailLocale, renderEmail, resolveLocale } from "./email-templates";
import { sendMail } from "./mailer";
import { generateSendKey } from "./send-key";

/** 通知の種類。設定のカラム名と解除リンクの `k=` に共通で使う */
export const NOTIFY_KINDS = ["digest", "expiry", "quota"] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];

export function isNotifyKind(v: string): v is NotifyKind {
  return (NOTIFY_KINDS as readonly string[]).includes(v);
}

/** 検証トークンの有効期限。長く持たせるほど、打ち間違えた宛先で有効化される窓が広がる */
const VERIFY_TTL_SECONDS = 24 * 3600;
const TOKEN_LENGTH = 32;

/**
 * 確認メールの日次上限 (受信者 1 人あたり)。
 *
 * `RATE_LIMITER_VERIFY` (3/60秒) だけだと、OAuth アカウントを 1 つ作った攻撃者が
 * 任意の宛先へ 1日 4,000 通以上を撃てる。furdrop.app のレピュテーションが焼けるうえ、
 * Cloudflare Email Service の内包枠 (月3,000通) が半日で枯れて通知全体が止まる。
 *
 * 正規の操作は「登録 → 打ち間違いに気づいて入れ直し → 再送」程度なので 5 回で足りる。
 */
const VERIFY_DAILY_LIMIT = 5;
const VERIFY_WINDOW_SECONDS = 24 * 3600;

export interface NotificationSettings {
  email: string | null;
  pending_email: string | null;
  notify_digest: boolean;
  notify_expiry: boolean;
  notify_quota: boolean;
}

/** 行が無いユーザーの既定値。フラグが 1 なのは「アドレスを検証した = 受け取る意思表示」だから */
const DEFAULTS: NotificationSettings = {
  email: null,
  pending_email: null,
  notify_digest: true,
  notify_expiry: true,
  notify_quota: true,
};

export async function loadSettings(env: Env, uid: string): Promise<NotificationSettings> {
  const row = await env.DB.prepare(
    "SELECT email, pending_email, notify_digest, notify_expiry, notify_quota FROM notification_settings WHERE receiver_id = ?",
  )
    .bind(uid)
    .first();

  if (!row) return { ...DEFAULTS };

  return {
    email: (row.email as string | null) ?? null,
    pending_email: (row.pending_email as string | null) ?? null,
    notify_digest: asBool(row.notify_digest),
    notify_expiry: asBool(row.notify_expiry),
    notify_quota: asBool(row.notify_quota),
  };
}

/** 行が無ければ既定値で作る。以降の UPDATE を素直に書けるようにするためだけの下準備 */
async function ensureRow(env: Env, uid: string, now: number): Promise<void> {
  await env.DB.prepare(
    "INSERT OR IGNORE INTO notification_settings (receiver_id, created_at, updated_at) VALUES (?, ?, ?)",
  )
    .bind(uid, now, now)
    .run();
}

/** 通知の種類ごとの ON/OFF を部分更新する (未指定は現在値を残す) */
export async function updateNotifyFlags(
  env: Env,
  uid: string,
  flags: { digest?: boolean; expiry?: boolean; quota?: boolean },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await ensureRow(env, uid, now);

  const asFlag = (v: boolean | undefined) => (v === undefined ? null : v ? 1 : 0);
  await env.DB.prepare(
    `UPDATE notification_settings SET
       notify_digest = COALESCE(?, notify_digest),
       notify_expiry = COALESCE(?, notify_expiry),
       notify_quota  = COALESCE(?, notify_quota),
       updated_at    = ?
     WHERE receiver_id = ?`,
  )
    .bind(asFlag(flags.digest), asFlag(flags.expiry), asFlag(flags.quota), now, uid)
    .run();
}

/**
 * 通知先アドレスの変更を受け付け、確認メールを送る。
 *
 * **検証が済むまで `email` は書き換えない。** アドレス変更中も旧アドレスに送り続ける
 * (変更したら通知が黙って止まる、のほうが事故) 。
 */
export async function startEmailVerification(
  env: Env,
  uid: string,
  email: string,
  locale: EmailLocale,
): Promise<{ ok: boolean }> {
  const now = Math.floor(Date.now() / 1000);
  await ensureRow(env, uid, now);

  const counter = await env.DB.prepare(
    "SELECT verify_window_start, verify_sent_count FROM notification_settings WHERE receiver_id = ?",
  )
    .bind(uid)
    .first<{ verify_window_start: number | null; verify_sent_count: number }>();

  const windowStart = counter?.verify_window_start ?? 0;
  const expired = now - windowStart >= VERIFY_WINDOW_SECONDS;
  const sentInWindow = expired ? 0 : (counter?.verify_sent_count ?? 0);
  if (sentInWindow >= VERIFY_DAILY_LIMIT) return { ok: false };

  const token = generateSendKey(TOKEN_LENGTH);
  await env.DB.prepare(
    `UPDATE notification_settings SET
       pending_email = ?, pending_token = ?, pending_expires = ?,
       verify_window_start = ?, verify_sent_count = ?, updated_at = ?
     WHERE receiver_id = ?`,
  )
    .bind(
      email,
      token,
      now + VERIFY_TTL_SECONDS,
      expired ? now : windowStart,
      sentInWindow + 1,
      now,
      uid,
    )
    .run();

  const mail = renderEmail("verify", locale, {
    email,
    verify_url: `${env.APP_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`,
  });
  await sendMail(env, { to: email, ...mail });
  return { ok: true };
}

/**
 * 検証待ちを取り消す。
 *
 * 打ち間違えたアドレスを登録したあと「元の検証済みアドレスに戻す」操作で呼ぶ。
 * これが無いと、打ち間違え先の第三者が 24 時間トークンリンクを踏めてしまい、
 * その受信者宛の通知が第三者に流れ始める。
 */
export async function cancelPendingEmail(env: Env, uid: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE notification_settings SET
       pending_email = NULL, pending_token = NULL, pending_expires = NULL, updated_at = ?
     WHERE receiver_id = ?`,
  )
    .bind(Math.floor(Date.now() / 1000), uid)
    .run();
}

/** 通知先アドレスと検証状態をまとめて消す */
export async function clearEmail(env: Env, uid: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE notification_settings SET
       email = NULL, pending_email = NULL, pending_token = NULL, pending_expires = NULL,
       unsubscribe_token = NULL, last_digest_at = NULL, quota_notice_level = 0, updated_at = ?
     WHERE receiver_id = ?`,
  )
    .bind(now, uid)
    .run();
}

export type VerifyResult =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid" | "expired" };

/**
 * 確認メールのリンクから呼ばれる。**認証は不要** — メールアプリから踏む人はログインしていない
 * ので、トークンそのものが認可になる。使い切りで、成功時に消す。
 */
export async function verifyEmailToken(env: Env, token: string): Promise<VerifyResult> {
  const row = await env.DB.prepare(
    "SELECT receiver_id, pending_email, pending_expires FROM notification_settings WHERE pending_token = ?",
  )
    .bind(token)
    .first<{ receiver_id: string; pending_email: string | null; pending_expires: number | null }>();

  if (!row?.pending_email) return { ok: false, reason: "invalid" };

  const now = Math.floor(Date.now() / 1000);
  if ((row.pending_expires ?? 0) < now) return { ok: false, reason: "expired" };

  // last_digest_at をここで打つ。打たないと、検証直後の初回ダイジェストが
  // 「これまでに受け取った写真すべて」になってしまう
  await env.DB.prepare(
    `UPDATE notification_settings SET
       email = pending_email,
       pending_email = NULL, pending_token = NULL, pending_expires = NULL,
       unsubscribe_token = COALESCE(unsubscribe_token, ?),
       last_digest_at = ?,
       updated_at = ?
     WHERE receiver_id = ?`,
  )
    .bind(generateSendKey(TOKEN_LENGTH), now, now, row.receiver_id)
    .run();

  return { ok: true, email: row.pending_email };
}

/** ワンクリック解除。該当する種類だけを止める (全部止めると意図より広く効く) */
export async function unsubscribeByToken(
  env: Env,
  token: string,
  kind: NotifyKind,
): Promise<boolean> {
  // カラム名は bind できないので、SQL 全体を種類ごとに固定文字列で持つ。
  // 呼び出し前に isNotifyKind で allowlist 済みだが、SQL を組み立てないほうが
  // repo ルール (「SQL 文字列の結合は禁止」) とも整合する
  const SQL: Record<NotifyKind, string> = {
    digest:
      "UPDATE notification_settings SET notify_digest = 0, updated_at = ? WHERE unsubscribe_token = ?",
    expiry:
      "UPDATE notification_settings SET notify_expiry = 0, updated_at = ? WHERE unsubscribe_token = ?",
    quota:
      "UPDATE notification_settings SET notify_quota = 0, updated_at = ? WHERE unsubscribe_token = ?",
  };

  const result = await env.DB.prepare(SQL[kind])
    .bind(Math.floor(Date.now() / 1000), token)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/** 通知メールに載せるリンクと RFC 8058 のヘッダ */
export function notificationLinks(env: Env, unsubscribeToken: string, kind: NotifyKind) {
  const t = encodeURIComponent(unsubscribeToken);
  return {
    vars: {
      gallery_url: `${env.APP_ORIGIN}/gallery`,
      // 人間が踏むのはフロントの確認ページ。メールセキュリティスキャナがリンクを自動巡回
      // するので、開いた瞬間ではなくボタンを押したときに解除する
      unsubscribe_url: `${env.APP_ORIGIN}/unsubscribe?t=${t}&k=${kind}`,
      settings_url: `${env.APP_ORIGIN}/settings`,
    },
    headers: {
      // RFC 8058: メールクライアントがこの URL へ POST する。静的な Pages では受けられない
      // ので API 側を指す。両ヘッダは DKIM の h= に含まれている必要がある
      // (Cloudflare Email Service は List-Unsubscribe を常に署名対象にすると明記している)
      "List-Unsubscribe": `<${env.API_ORIGIN}/notifications/unsubscribe?t=${t}&k=${kind}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

export { resolveLocale };
