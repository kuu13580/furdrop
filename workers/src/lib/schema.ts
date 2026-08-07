import type { Hook } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";

/** 共通エラーレスポンス */
export const ErrorSchema = z.object({
  error: z.object({
    code: z.string().openapi({ example: "NOT_FOUND" }),
    message: z.string().openapi({ example: "Resource not found" }),
  }),
});

/**
 * zod バリデーション失敗を共通エラー形式に揃える defaultHook。
 *
 * これが無いと `@hono/zod-openapi` は ZodError をそのまま 400 で返すため、
 * `{ error: { code, message } }` を前提にしているクライアントが
 * `code` を拾えない。全ての OpenAPIHono インスタンスに渡すこと。
 *
 * `message` は開発者向けの英語テキスト。
 *
 * 既知の割り切り: ここが返す 400 は各ルートの `responses` に宣言していないため
 * `/openapi.json` には現れない。ドキュメントは dev 限定 (本番では 404) なので、
 * 全ルートに 400 を足すコストに見合わないと判断している。
 */
// biome-ignore lint/suspicious/noExplicitAny: Hook のジェネリクスは各ルータの Env に依存するため任意型で受ける
export const defaultHook: Hook<unknown, any, string, unknown> = (result, c) => {
  if (result.success) return;
  const issue = result.error.issues[0];
  const path = issue?.path.join(".");
  const message = issue
    ? `Validation failed${path ? ` at "${path}"` : ""}: ${issue.message}`
    : "Validation failed";
  return c.json({ error: { code: "INVALID_REQUEST", message } }, 400);
};

/** handle パスパラメータ */
export const HandleParam = z.object({
  handle: z
    .string()
    .regex(/^[a-z0-9_]{3,32}$/)
    .openapi({ param: { name: "handle", in: "path" } }),
});

/** sessionId パスパラメータ */
export const SessionIdParam = z.object({
  sessionId: z
    .string()
    .uuid({ version: "v4" })
    .openapi({ param: { name: "sessionId", in: "path" } }),
});

/** photoId パスパラメータ */
export const PhotoIdParam = z.object({
  photoId: z
    .string()
    .uuid({ version: "v4" })
    .openapi({ param: { name: "photoId", in: "path" } }),
});
