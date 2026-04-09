import { z } from "@hono/zod-openapi";

/** 共通エラーレスポンス */
export const ErrorSchema = z.object({
  error: z.object({
    code: z.string().openapi({ example: "NOT_FOUND" }),
    message: z.string().openapi({ example: "Resource not found" }),
  }),
});

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
