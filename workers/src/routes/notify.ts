/**
 * 通知メールのリンクから叩かれるエンドポイント (R09)。**いずれも認証を要求しない。**
 *
 * メールアプリからリンクを踏む人はログインしていないし、RFC 8058 のワンクリック解除に
 * 至ってはメールクライアント自身が POST してくる。どちらもトークンの知識が認可になる。
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { isNotifyKind, unsubscribeByToken, verifyEmailToken } from "../lib/notification";
import { defaultHook, ErrorSchema } from "../lib/schema";
import type { Env } from "../types";

const notify = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

// ========== POST /auth/verify-email ==========

const verifyRoute = createRoute({
  method: "post",
  path: "/verify-email",
  tags: ["Notifications"],
  summary: "通知先メールアドレスの確認",
  request: {
    body: { content: { "application/json": { schema: z.object({ token: z.string() }) } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ email: z.string() }) } },
      description: "検証成功",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "トークンが無効 (使用済みを含む)",
    },
    410: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "トークンの有効期限切れ",
    },
  },
});

export const verifyEmailRoute = verifyRoute;

notify.openapi(verifyRoute, async (c) => {
  const { token } = c.req.valid("json");
  const result = await verifyEmailToken(c.env, token);

  if (result.ok) return c.json({ email: result.email }, 200);
  if (result.reason === "expired") {
    return c.json({ error: { code: "NOT_FOUND", message: "Verification link expired" } }, 410);
  }
  return c.json({ error: { code: "NOT_FOUND", message: "Invalid verification token" } }, 404);
});

export default notify;

/**
 * ワンクリック解除 (RFC 8058)。
 *
 * OpenAPIHono ではなく素の Hono ハンドラとして index.ts に直接生やす。
 * メールクライアントは `Content-Type: multipart/form-data` で
 * `List-Unsubscribe=One-Click` を送ってくるので、zod のスキーマ検証を通す意味がない
 * (本文は読まず、クエリのトークンだけで決まる)。
 *
 * 応答は text/plain。読むのは人間ではなくメールクライアントで、
 * 200 が返りさえすれば「解除済み」と表示する。
 */
export async function handleUnsubscribe(env: Env, url: URL): Promise<Response> {
  const token = url.searchParams.get("t");
  const kind = url.searchParams.get("k");

  if (!token || !kind || !isNotifyKind(kind)) {
    return new Response("Invalid unsubscribe link\n", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const ok = await unsubscribeByToken(env, token, kind);

  // 見つからないトークンでも 200 を返す。解除できたかどうかでトークンの有効性が
  // 分かってしまうのを避けるのと、メールクライアントにエラーを表示させないため
  return new Response(ok ? "Unsubscribed\n" : "Already unsubscribed\n", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
