import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { asBool } from "../lib/d1";
import { resolveLocale } from "../lib/email-templates";
import { logError } from "../lib/logger";
import {
  cancelPendingEmail,
  clearEmail,
  loadSettings,
  type NotificationSettings,
  startEmailVerification,
  updateNotifyFlags,
} from "../lib/notification";
import { defaultHook, ErrorSchema } from "../lib/schema";
import { generateSendKey } from "../lib/send-key";
import { requireAuth } from "../middleware/auth";
import type { AuthEnv } from "../types";

const HANDLE_REGEX = /^[a-z0-9_]{3,32}$/;

const EmbedModeSchema = z.enum(["disabled", "optional", "required"]);

const UserSchema = z.object({
  id: z.string(),
  handle: z.string(),
  display_name: z.string(),
  storage_used: z.number(),
  storage_quota: z.number(),
  receive_url: z.string(),
  is_active: z.boolean(),
  watermark_mode: EmbedModeSchema,
  require_sender_name: z.boolean(),
  require_send_key: z.boolean(),
  // R09 通知設定。notification_settings の行が無いユーザーは未設定の既定値が返る
  notification_email: z.string().nullable(),
  pending_email: z.string().nullable(),
  notify_digest: z.boolean(),
  notify_expiry: z.boolean(),
  notify_quota: z.boolean(),
  locale: z.enum(["ja", "en"]).nullable(),
});

const USER_COLUMNS =
  "id, handle, display_name, storage_used, storage_quota, is_active, watermark_mode, require_sender_name, require_send_key, locale";

type EmbedMode = z.infer<typeof EmbedModeSchema>;

function asMode(v: unknown): EmbedMode {
  return v === "required" || v === "optional" ? v : "disabled";
}

/**
 * D1 の users 行 + 通知設定を API のユーザー表現にまとめる。
 * register / me / options の 3 経路が同じ形を返す必要があるので 1 箇所に寄せている。
 */
function toUserResponse(
  row: Record<string, unknown>,
  receiveUrl: string,
  notify: NotificationSettings,
) {
  return {
    id: row.id as string,
    handle: row.handle as string,
    display_name: row.display_name as string,
    storage_used: row.storage_used as number,
    storage_quota: row.storage_quota as number,
    receive_url: receiveUrl,
    is_active: asBool(row.is_active),
    watermark_mode: asMode(row.watermark_mode),
    require_sender_name: asBool(row.require_sender_name),
    require_send_key: asBool(row.require_send_key),
    notification_email: notify.email,
    pending_email: notify.pending_email,
    notify_digest: notify.notify_digest,
    notify_expiry: notify.notify_expiry,
    notify_quota: notify.notify_quota,
    locale: row.locale === "en" || row.locale === "ja" ? (row.locale as "ja" | "en") : null,
  };
}

/**
 * 受信 URL を ?k=KEY 付きで組み立てる。
 * 受信者にはキーごとのレコードがあるが、ダッシュボードに出すのは「いちばん古いキー」1 つだけ。
 * キーが 1 件も無いケースは通常起こらないが (register 時に必ず 1 件作る)、フォールバックで素の URL を返す。
 * requireSendKey が false のときはキーを検証しないので、URL からも落として短くする。
 */
async function buildReceiveUrl(
  db: D1Database,
  receiverId: string,
  handle: string,
  requireSendKey: boolean,
): Promise<string> {
  if (!requireSendKey) return `/send/${handle}`;

  const row = await db
    .prepare(
      "SELECT key_value FROM send_keys WHERE receiver_id = ? ORDER BY created_at ASC, id ASC LIMIT 1",
    )
    .bind(receiverId)
    .first<{ key_value: string }>();
  if (!row) return `/send/${handle}`;
  return `/send/${handle}?k=${row.key_value}`;
}

const auth = new OpenAPIHono<AuthEnv>({ defaultHook });

auth.use("*", requireAuth);

// ========== POST /auth/register ==========

const registerRoute = createRoute({
  method: "post",
  path: "/register",
  tags: ["Auth"],
  summary: "新規受信者登録",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            handle: z.string().regex(HANDLE_REGEX),
            display_name: z.string().min(1).max(50),
            watermark_mode: EmbedModeSchema.optional(),
            require_sender_name: z.boolean().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: z.object({ user: UserSchema }) } },
      description: "登録成功",
    },
    409: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "handle使用済み",
    },
  },
});

auth.openapi(registerRoute, async (c) => {
  const uid = c.get("uid");
  const email = c.get("email");
  const { handle, display_name, watermark_mode, require_sender_name } = c.req.valid("json");

  // UID重複チェック (べき等性: 既存ユーザーをそのまま返す)
  const existing = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .bind(uid)
    .first();

  if (existing) {
    const receiveUrl = await buildReceiveUrl(
      c.env.DB,
      uid,
      existing.handle as string,
      asBool(existing.require_send_key),
    );
    return c.json(
      { user: toUserResponse(existing, receiveUrl, await loadSettings(c.env, uid)) },
      201,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const avatarUrl = c.get("picture") ?? null;
  const watermarkMode: EmbedMode = watermark_mode ?? "disabled";
  const requireSenderName = require_sender_name === true;

  // INSERT first — UNIQUE制約違反でhandle重複を検出 (レースコンディション防止)
  try {
    await c.env.DB.prepare(
      `INSERT INTO users (id, handle, display_name, email, avatar_url, storage_used, storage_quota, is_active, watermark_mode, require_sender_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 10737418240, 1, ?, ?, ?, ?)`,
    )
      .bind(
        uid,
        handle,
        display_name,
        email,
        avatarUrl,
        watermarkMode,
        requireSenderName ? 1 : 0,
        now,
        now,
      )
      .run();
  } catch (e) {
    if (String(e).includes("UNIQUE constraint failed: users.handle")) {
      return c.json(
        { error: { code: "HANDLE_TAKEN", message: "This handle is already taken" } },
        409,
      );
    }
    throw e;
  }

  // ユーザー作成と同時に送信キーを 1 つ発行する。これ以降はマイグレーション SQL ではなく
  // generateSendKey() (URL-safe 21文字) を使うのでフォーマットが揃う。
  const keyId = crypto.randomUUID();
  const keyValue = generateSendKey();
  await c.env.DB.prepare(
    "INSERT INTO send_keys (id, receiver_id, key_value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(keyId, uid, keyValue, now, now)
    .run();

  return c.json(
    {
      user: toUserResponse(
        {
          id: uid,
          handle,
          display_name,
          storage_used: 0,
          storage_quota: 10737418240,
          is_active: 1,
          watermark_mode: watermarkMode,
          require_sender_name: requireSenderName ? 1 : 0,
          require_send_key: 1,
          locale: null,
        },
        `/send/${handle}?k=${keyValue}`,
        // 登録直後は通知設定の行がまだ無い (アドレス登録時に遅延生成される)
        await loadSettings(c.env, uid),
      ),
    },
    201,
  );
});

// ========== GET /auth/me ==========

const meRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Auth"],
  summary: "自分の情報取得",
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ user: UserSchema }) } },
      description: "ユーザー情報",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "未登録ユーザー",
    },
  },
});

auth.openapi(meRoute, async (c) => {
  const uid = c.get("uid");

  const user = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .bind(uid)
    .first();

  if (!user) {
    return c.json({ error: { code: "NOT_FOUND", message: "User not registered" } }, 404);
  }

  const receiveUrl = await buildReceiveUrl(
    c.env.DB,
    uid,
    user.handle as string,
    asBool(user.require_send_key),
  );

  return c.json({ user: toUserResponse(user, receiveUrl, await loadSettings(c.env, uid)) }, 200);
});

// ========== PATCH /auth/options ==========

const updateOptionsRoute = createRoute({
  method: "patch",
  path: "/options",
  tags: ["Auth"],
  summary: "受信オプション更新",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            watermark_mode: EmbedModeSchema.optional(),
            require_sender_name: z.boolean().optional(),
            is_active: z.boolean().optional(),
            require_send_key: z.boolean().optional(),
            // R09。null または空文字で通知先ごと解除する。
            // z.string().email() だけだと空文字が先に弾かれ、解除の分岐に到達しない
            notification_email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
            notify_digest: z.boolean().optional(),
            notify_expiry: z.boolean().optional(),
            notify_quota: z.boolean().optional(),
            // 表示言語。言語トグルを押すたびにフロントが投げる (メールの言語判定に使う)
            locale: z.enum(["ja", "en"]).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ user: UserSchema }) } },
      description: "更新成功",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "未登録ユーザー",
    },
    429: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "確認メールのレート制限",
    },
    502: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "確認メールの送信に失敗",
    },
  },
});

auth.openapi(updateOptionsRoute, async (c) => {
  const uid = c.get("uid");
  const body = c.req.valid("json");

  const asFlag = (v: boolean | undefined) => (v === undefined ? null : v ? 1 : 0);

  // 未指定フィールドは NULL を bind し、COALESCE で書き込み時点の現在値を残す。
  // 設定画面は複数カードから独立に PATCH を投げるので、読み取った値を全カラムに
  // 書き戻すと後着のリクエストが他方の変更を巻き戻してしまう
  if (Object.keys(body).length > 0) {
    const now = Math.floor(Date.now() / 1000);
    await c.env.DB.prepare(
      `UPDATE users SET
         watermark_mode      = COALESCE(?, watermark_mode),
         require_sender_name = COALESCE(?, require_sender_name),
         is_active           = COALESCE(?, is_active),
         require_send_key    = COALESCE(?, require_send_key),
         locale              = COALESCE(?, locale),
         updated_at          = ?
       WHERE id = ?`,
    )
      .bind(
        body.watermark_mode ?? null,
        asFlag(body.require_sender_name),
        asFlag(body.is_active),
        asFlag(body.require_send_key),
        body.locale ?? null,
        now,
        uid,
      )
      .run();
  }

  // ユーザーの存在確認は通知設定を触る前に済ませる。notification_settings は
  // users を参照する FK を持つので、未登録 UID で先に書きに行くと FK 違反の 500 になり、
  // 本来の 404 (登録画面へ誘導する自然なリカバリ) が壊れる
  const user = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .bind(uid)
    .first();

  if (!user) {
    return c.json({ error: { code: "NOT_FOUND", message: "User not registered" } }, 404);
  }

  // --- R09 通知設定 ---

  if (
    body.notify_digest !== undefined ||
    body.notify_expiry !== undefined ||
    body.notify_quota !== undefined
  ) {
    await updateNotifyFlags(c.env, uid, {
      digest: body.notify_digest,
      expiry: body.notify_expiry,
      quota: body.notify_quota,
    });
  }

  if (body.notification_email !== undefined) {
    const next = body.notification_email?.trim() || null;
    const current = await loadSettings(c.env, uid);

    if (next === null) {
      await clearEmail(c.env, uid);
    } else if (next === current.email) {
      // 検証済みのアドレスに戻す操作。確認メールは要らないが、**検証待ちは消す** —
      // 残すと打ち間違え先の第三者が 24 時間トークンを踏めてしまう
      if (current.pending_email !== null) await cancelPendingEmail(c.env, uid);
    } else {
      // 認証済みユーザーが任意のアドレスへ確認メールを撃てる = メール中継になりうるので
      // 分単位 (バインディング) と日単位 (DB のカウンタ) の両方で絞る
      const { success } = await c.env.RATE_LIMITER_VERIFY.limit({ key: uid });
      if (!success) {
        c.header("Retry-After", "60");
        return c.json(
          { error: { code: "RATE_LIMITED", message: "Too many verification emails" } },
          429,
        );
      }
      const sent = await startEmailVerification(
        c.env,
        uid,
        next,
        resolveLocale(body.locale ?? (user.locale as string | null)),
      );
      if (!sent.ok) {
        if (sent.reason === "rate_limited") {
          return c.json(
            { error: { code: "RATE_LIMITED", message: "Daily verification email limit reached" } },
            429,
          );
        }
        // 送信そのものが失敗したときに 200 を返すと、画面が「確認メールを送りました」と
        // 出したまま何も届かない。レート制限とは別のエラーとして返す
        return c.json(
          { error: { code: "MAIL_SEND_FAILED", message: "Failed to send verification email" } },
          502,
        );
      }
    }
  }

  const receiveUrl = await buildReceiveUrl(
    c.env.DB,
    uid,
    user.handle as string,
    asBool(user.require_send_key),
  );

  return c.json({ user: toUserResponse(user, receiveUrl, await loadSettings(c.env, uid)) }, 200);
});

// ========== DELETE /auth/account ==========

const deleteAccountRoute = createRoute({
  method: "delete",
  path: "/account",
  tags: ["Auth"],
  summary: "受信者アカウント削除",
  request: {
    body: {
      content: {
        "application/json": {
          // ハンドル誤操作防止: 自分のハンドルを再入力させる (UI側で同等チェック済みだがサーバ側でも検証)
          schema: z.object({ confirm_handle: z.string() }),
        },
      },
    },
  },
  responses: {
    204: { description: "削除成功" },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "確認用ハンドル不一致",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "未登録ユーザー",
    },
  },
});

auth.openapi(deleteAccountRoute, async (c) => {
  const uid = c.get("uid");
  const { confirm_handle } = c.req.valid("json");

  const user = await c.env.DB.prepare("SELECT handle FROM users WHERE id = ?")
    .bind(uid)
    .first<{ handle: string }>();

  if (!user) {
    return c.json({ error: { code: "NOT_FOUND", message: "User not registered" } }, 404);
  }

  if (confirm_handle !== user.handle) {
    return c.json(
      { error: { code: "INVALID_REQUEST", message: "Confirm handle does not match" } },
      400,
    );
  }

  // R2 削除のため、先に全 photos の R2 key を取得
  const photos = await c.env.DB.prepare(
    "SELECT r2_key_original, r2_key_thumb FROM photos WHERE receiver_id = ?",
  )
    .bind(uid)
    .all<{ r2_key_original: string; r2_key_thumb: string }>();

  // 利用規約第13条 / プライバシーポリシーで「送信者の通信記録 (sender_ip/sender_ua) は
  // 当該送信から最低3か月保存」を保証している。Cron pruneOldSessionLogs が 100日経過後に
  // 該当フィールドを NULL クリアするため、ここでも 100日経過済みのセッションのみ物理削除する。
  // 残ったセッション (receiver は削除済み = 孤児) は cleanup.ts の cleanupOrphanedSessions が
  // 100日経過後に物理削除する。
  const sessionRetentionThreshold = Math.floor(Date.now() / 1000) - 100 * 24 * 60 * 60;

  // DB を batch で削除 (photos → send_keys → upload_sessions → users)
  // D1 はトランザクション分離はないが、batch は順序を保証
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM photos WHERE receiver_id = ?").bind(uid),
    c.env.DB.prepare("DELETE FROM send_keys WHERE receiver_id = ?").bind(uid),
    c.env.DB.prepare("DELETE FROM notification_settings WHERE receiver_id = ?").bind(uid),
    c.env.DB.prepare("DELETE FROM upload_sessions WHERE receiver_id = ? AND created_at < ?").bind(
      uid,
      sessionRetentionThreshold,
    ),
    c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(uid),
  ]);

  // R2 削除はレスポンスを早く返すため背景実行。失敗しても D1 は整合 (孤立オブジェクトのみ残る)。
  // サブリクエスト上限 (Paid plan: 1000/invocation) を超える場合は残分が orphan になるが、
  // ユーザー削除は頻度が低く、一人あたり通常数百枚以下のため許容する。
  if (photos.results.length > 0) {
    c.executionCtx.waitUntil(
      Promise.allSettled([
        ...photos.results.map((p) => c.env.R2_ORIGINALS.delete(p.r2_key_original)),
        ...photos.results.map((p) => c.env.R2_THUMBS.delete(p.r2_key_thumb)),
      ]).then((results) => {
        // 背景削除の失敗はレスポンスに影響しないが、孤立オブジェクトの発生源になる。
        // サイレントにせず件数を記録して検知できるようにする。
        const failures = results.filter((r) => r.status === "rejected");
        if (failures.length > 0) {
          logError("account-delete-r2", (failures[0] as PromiseRejectedResult).reason, {
            uid,
            failed: failures.length,
            total: results.length,
          });
        }
      }),
    );
  }

  return c.body(null, 204);
});

export default auth;
