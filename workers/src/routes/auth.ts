import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ErrorSchema } from "../lib/schema";
import { requireAuth } from "../middleware/auth";
import type { AuthEnv } from "../types";

const HANDLE_REGEX = /^[a-z0-9_]{3,32}$/;

const UserSchema = z.object({
  id: z.string(),
  handle: z.string(),
  display_name: z.string(),
  storage_used: z.number(),
  storage_quota: z.number(),
  receive_url: z.string(),
  allow_exif_embed: z.boolean(),
  allow_watermark: z.boolean(),
});

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
            allow_exif_embed: z.boolean().optional(),
            allow_watermark: z.boolean().optional(),
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
  const { handle, display_name, allow_exif_embed, allow_watermark } = c.req.valid("json");

  // UID重複チェック (べき等性: 既存ユーザーをそのまま返す)
  const existing = await c.env.DB.prepare(
    "SELECT id, handle, display_name, storage_used, storage_quota, allow_exif_embed, allow_watermark FROM users WHERE id = ?",
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
          allow_exif_embed: existing.allow_exif_embed === 1,
          allow_watermark: existing.allow_watermark === 1,
        },
      },
      201,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const avatarUrl = c.get("picture") ?? null;
  const allowExif = allow_exif_embed ?? true;
  const allowWatermark = allow_watermark ?? true;

  // INSERT first — UNIQUE制約違反でhandle重複を検出 (レースコンディション防止)
  try {
    await c.env.DB.prepare(
      `INSERT INTO users (id, handle, display_name, email, avatar_url, storage_used, storage_quota, is_active, allow_exif_embed, allow_watermark, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 10737418240, 1, ?, ?, ?, ?)`,
    )
      .bind(
        uid,
        handle,
        display_name,
        email,
        avatarUrl,
        allowExif ? 1 : 0,
        allowWatermark ? 1 : 0,
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

  return c.json(
    {
      user: {
        id: uid,
        handle,
        display_name,
        storage_used: 0,
        storage_quota: 10737418240,
        receive_url: `/send/${handle}`,
        allow_exif_embed: allowExif,
        allow_watermark: allowWatermark,
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
    "SELECT id, handle, display_name, storage_used, storage_quota, allow_exif_embed, allow_watermark FROM users WHERE id = ?",
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
        allow_exif_embed: user.allow_exif_embed === 1,
        allow_watermark: user.allow_watermark === 1,
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
            allow_exif_embed: z.boolean().optional(),
            allow_watermark: z.boolean().optional(),
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

  const sets: string[] = [];
  const binds: (number | string)[] = [];

  if (body.allow_exif_embed !== undefined) {
    sets.push("allow_exif_embed = ?");
    binds.push(body.allow_exif_embed ? 1 : 0);
  }
  if (body.allow_watermark !== undefined) {
    sets.push("allow_watermark = ?");
    binds.push(body.allow_watermark ? 1 : 0);
  }

  if (sets.length === 0) {
    // 何も変更しない場合は現在の値を返す
    const user = await c.env.DB.prepare(
      "SELECT id, handle, display_name, storage_used, storage_quota, allow_exif_embed, allow_watermark FROM users WHERE id = ?",
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
          allow_exif_embed: user.allow_exif_embed === 1,
          allow_watermark: user.allow_watermark === 1,
        },
      },
      200,
    );
  }

  // 存在確認 (changed_db は同値UPDATEで false になるため SELECT で判定)
  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(uid).first();

  if (!existing) {
    return c.json({ error: { code: "NOT_FOUND", message: "User not registered" } }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  sets.push("updated_at = ?");
  binds.push(now);
  binds.push(uid);

  await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds)
    .run();

  // UPDATE後の最新値を返す (existing確認済みなので必ず存在する)
  const user = (await c.env.DB.prepare(
    "SELECT id, handle, display_name, storage_used, storage_quota, allow_exif_embed, allow_watermark FROM users WHERE id = ?",
  )
    .bind(uid)
    .first()) as Record<string, unknown>;

  return c.json(
    {
      user: {
        id: user.id as string,
        handle: user.handle as string,
        display_name: user.display_name as string,
        storage_used: user.storage_used as number,
        storage_quota: user.storage_quota as number,
        receive_url: `/send/${user.handle}`,
        allow_exif_embed: user.allow_exif_embed === 1,
        allow_watermark: user.allow_watermark === 1,
      },
    },
    200,
  );
});

export default auth;
