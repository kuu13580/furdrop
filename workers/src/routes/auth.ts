import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ErrorSchema } from "../lib/schema";
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
    return c.json(
      {
        user: {
          id: existing.id as string,
          handle: existing.handle as string,
          display_name: existing.display_name as string,
          storage_used: existing.storage_used as number,
          storage_quota: existing.storage_quota as number,
          receive_url: `/send/${existing.handle}`,
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

  return c.json(
    {
      user: {
        id: uid,
        handle,
        display_name,
        storage_used: 0,
        storage_quota: 10737418240,
        receive_url: `/send/${handle}`,
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

  return c.json(
    {
      user: {
        id: user.id as string,
        handle: user.handle as string,
        display_name: user.display_name as string,
        storage_used: user.storage_used as number,
        storage_quota: user.storage_quota as number,
        receive_url: `/send/${user.handle}`,
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

  return c.json(
    {
      user: {
        id: current.id as string,
        handle: current.handle as string,
        display_name: current.display_name as string,
        storage_used: current.storage_used as number,
        storage_quota: current.storage_quota as number,
        receive_url: `/send/${current.handle}`,
        exif_embed_mode: nextExif,
        watermark_mode: nextWatermark,
      },
    },
    200,
  );
});

export default auth;
