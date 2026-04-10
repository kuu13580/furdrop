import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ErrorSchema } from "../lib/schema";
import { requireAuth } from "../middleware/auth";
import type { Env } from "../types";

type AuthEnv = {
  Bindings: Env;
  Variables: { uid: string; email: string; name?: string; picture?: string };
};

const HANDLE_REGEX = /^[a-z0-9_]{3,32}$/;

const UserSchema = z.object({
  id: z.string(),
  handle: z.string(),
  display_name: z.string(),
  storage_used: z.number(),
  storage_quota: z.number(),
  receive_url: z.string(),
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
  const { handle, display_name } = c.req.valid("json");

  // UID重複チェック (べき等性: 既存ユーザーをそのまま返す)
  const existing = await c.env.DB.prepare(
    "SELECT id, handle, display_name, storage_used, storage_quota FROM users WHERE id = ?",
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
        },
      },
      201,
    );
  }

  // handle重複チェック
  const handleTaken = await c.env.DB.prepare("SELECT id FROM users WHERE handle = ?")
    .bind(handle)
    .first();

  if (handleTaken) {
    return c.json(
      { error: { code: "HANDLE_TAKEN", message: "This handle is already taken" } },
      409,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const avatarUrl = c.get("picture") ?? null;

  await c.env.DB.prepare(
    `INSERT INTO users (id, handle, display_name, email, avatar_url, storage_used, storage_quota, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 10737418240, 1, ?, ?)`,
  )
    .bind(uid, handle, display_name, email, avatarUrl, now, now)
    .run();

  return c.json(
    {
      user: {
        id: uid,
        handle,
        display_name,
        storage_used: 0,
        storage_quota: 10737418240,
        receive_url: `/send/${handle}`,
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
    "SELECT id, handle, display_name, storage_used, storage_quota FROM users WHERE id = ?",
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
      },
    },
    200,
  );
});

export default auth;
