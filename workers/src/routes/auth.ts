import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ErrorSchema } from "../lib/schema";
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
  exif_embed_mode: EmbedModeSchema,
  watermark_mode: EmbedModeSchema,
});

type EmbedMode = z.infer<typeof EmbedModeSchema>;

function asMode(v: unknown): EmbedMode {
  return v === "required" || v === "optional" ? v : "disabled";
}

/**
 * 受信 URL を ?k=KEY 付きで組み立てる。
 * 受信者にはキーごとのレコードがあるが、ダッシュボードに出すのは「いちばん古いキー」1 つだけ。
 * キーが 1 件も無いケースは通常起こらないが (register 時に必ず 1 件作る)、フォールバックで素の URL を返す。
 */
async function buildReceiveUrl(
  db: D1Database,
  receiverId: string,
  handle: string,
): Promise<string> {
  const row = await db
    .prepare(
      "SELECT key_value FROM send_keys WHERE receiver_id = ? ORDER BY created_at ASC, id ASC LIMIT 1",
    )
    .bind(receiverId)
    .first<{ key_value: string }>();
  if (!row) return `/send/${handle}`;
  return `/send/${handle}?k=${row.key_value}`;
}

const auth = new OpenAPIHono<AuthEnv>();

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
            exif_embed_mode: EmbedModeSchema.optional(),
            watermark_mode: EmbedModeSchema.optional(),
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
  const { handle, display_name, exif_embed_mode, watermark_mode } = c.req.valid("json");

  // UID重複チェック (べき等性: 既存ユーザーをそのまま返す)
  const existing = await c.env.DB.prepare(
    "SELECT id, handle, display_name, storage_used, storage_quota, exif_embed_mode, watermark_mode FROM users WHERE id = ?",
  )
    .bind(uid)
    .first();

  if (existing) {
    const receiveUrl = await buildReceiveUrl(c.env.DB, uid, existing.handle as string);
    return c.json(
      {
        user: {
          id: existing.id as string,
          handle: existing.handle as string,
          display_name: existing.display_name as string,
          storage_used: existing.storage_used as number,
          storage_quota: existing.storage_quota as number,
          receive_url: receiveUrl,
          exif_embed_mode: asMode(existing.exif_embed_mode),
          watermark_mode: asMode(existing.watermark_mode),
        },
      },
      201,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const avatarUrl = c.get("picture") ?? null;
  const exifMode: EmbedMode = exif_embed_mode ?? "optional";
  const watermarkMode: EmbedMode = watermark_mode ?? "disabled";

  // INSERT first — UNIQUE制約違反でhandle重複を検出 (レースコンディション防止)
  try {
    await c.env.DB.prepare(
      `INSERT INTO users (id, handle, display_name, email, avatar_url, storage_used, storage_quota, is_active, exif_embed_mode, watermark_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 10737418240, 1, ?, ?, ?, ?)`,
    )
      .bind(uid, handle, display_name, email, avatarUrl, exifMode, watermarkMode, now, now)
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
      user: {
        id: uid,
        handle,
        display_name,
        storage_used: 0,
        storage_quota: 10737418240,
        receive_url: `/send/${handle}?k=${keyValue}`,
        exif_embed_mode: exifMode,
        watermark_mode: watermarkMode,
      },
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

  const user = await c.env.DB.prepare(
    "SELECT id, handle, display_name, storage_used, storage_quota, exif_embed_mode, watermark_mode FROM users WHERE id = ?",
  )
    .bind(uid)
    .first();

  if (!user) {
    return c.json({ error: { code: "NOT_FOUND", message: "User not registered" } }, 404);
  }

  const receiveUrl = await buildReceiveUrl(c.env.DB, uid, user.handle as string);

  return c.json(
    {
      user: {
        id: user.id as string,
        handle: user.handle as string,
        display_name: user.display_name as string,
        storage_used: user.storage_used as number,
        storage_quota: user.storage_quota as number,
        receive_url: receiveUrl,
        exif_embed_mode: asMode(user.exif_embed_mode),
        watermark_mode: asMode(user.watermark_mode),
      },
    },
    200,
  );
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
            exif_embed_mode: EmbedModeSchema.optional(),
            watermark_mode: EmbedModeSchema.optional(),
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
  },
});

auth.openapi(updateOptionsRoute, async (c) => {
  const uid = c.get("uid");
  const body = c.req.valid("json");

  // 現在値を取得し、未指定フィールドのデフォルトとして使う
  // (動的SQL組み立てを避けるため、UPDATE は常に両カラム + updated_at を固定SQLで書く)
  const current = await c.env.DB.prepare(
    "SELECT id, handle, display_name, storage_used, storage_quota, exif_embed_mode, watermark_mode FROM users WHERE id = ?",
  )
    .bind(uid)
    .first();

  if (!current) {
    return c.json({ error: { code: "NOT_FOUND", message: "User not registered" } }, 404);
  }

  const nextExif = body.exif_embed_mode ?? asMode(current.exif_embed_mode);
  const nextWatermark = body.watermark_mode ?? asMode(current.watermark_mode);

  const noChange =
    nextExif === asMode(current.exif_embed_mode) &&
    nextWatermark === asMode(current.watermark_mode);

  if (!noChange) {
    const now = Math.floor(Date.now() / 1000);
    await c.env.DB.prepare(
      "UPDATE users SET exif_embed_mode = ?, watermark_mode = ?, updated_at = ? WHERE id = ?",
    )
      .bind(nextExif, nextWatermark, now, uid)
      .run();
  }

  const receiveUrl = await buildReceiveUrl(c.env.DB, uid, current.handle as string);

  return c.json(
    {
      user: {
        id: current.id as string,
        handle: current.handle as string,
        display_name: current.display_name as string,
        storage_used: current.storage_used as number,
        storage_quota: current.storage_quota as number,
        receive_url: receiveUrl,
        exif_embed_mode: nextExif,
        watermark_mode: nextWatermark,
      },
    },
    200,
  );
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
      { error: { code: "INVALID_REQUEST", message: "確認用ハンドルが一致しません" } },
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
      ]).then(() => undefined),
    );
  }

  return c.body(null, 204);
});

export default auth;
