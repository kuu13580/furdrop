import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { subtractStorageUsage } from "../lib/quota";
import { createDownloadUrl, createThumbViewUrl } from "../lib/r2";
import { ErrorSchema } from "../lib/schema";
import { requireAuth } from "../middleware/auth";
import type { Env } from "../types";

type AuthEnv = {
  Bindings: Env;
  Variables: { uid: string; email: string; name?: string; picture?: string };
};

const receiver = new OpenAPIHono<AuthEnv>();

receiver.use("*", requireAuth);

// ========== GET /receiver/photos ==========

const listPhotosRoute = createRoute({
  method: "get",
  path: "/photos",
  tags: ["Receiver"],
  summary: "受信写真一覧 (カーソルベース)",
  request: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      cursor: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            photos: z.array(
              z.object({
                id: z.string(),
                sender_name: z.string().nullable(),
                camera_model: z.string().nullable(),
                original_filename: z.string().nullable(),
                file_size: z.number(),
                width: z.number().nullable(),
                height: z.number().nullable(),
                thumb_url: z.string().nullable(),
                created_at: z.number(),
              }),
            ),
            next_cursor: z.string().nullable(),
          }),
        },
      },
      description: "写真一覧",
    },
  },
});

receiver.openapi(listPhotosRoute, async (c) => {
  const uid = c.get("uid");
  const { limit, cursor } = c.req.valid("query");

  let query =
    "SELECT id, sender_name, camera_model, original_filename, file_size, width, height, r2_key_thumb, created_at FROM photos WHERE receiver_id = ? AND upload_status = 'completed'";
  const params: (string | number)[] = [uid];

  if (cursor) {
    // カーソル = Base64エンコードされた created_at:id
    const decoded = atob(cursor);
    const [cursorCreatedAt, cursorId] = decoded.split(":");
    query += " AND (created_at < ? OR (created_at = ? AND id < ?))";
    params.push(Number(cursorCreatedAt), Number(cursorCreatedAt), cursorId);
  }

  query += " ORDER BY created_at DESC, id DESC LIMIT ?";
  params.push(limit + 1); // 1件多く取得してnext_cursorを判定

  const result = await c.env.DB.prepare(query)
    .bind(...params)
    .all();

  const hasMore = result.results.length > limit;
  const photos = hasMore ? result.results.slice(0, limit) : result.results;

  const photosWithUrls = await Promise.all(
    photos.map(async (p) => ({
      id: p.id as string,
      sender_name: p.sender_name as string | null,
      camera_model: p.camera_model as string | null,
      original_filename: p.original_filename as string | null,
      file_size: p.file_size as number,
      width: p.width as number | null,
      height: p.height as number | null,
      thumb_url: await createThumbViewUrl(c.env, p.r2_key_thumb as string),
      created_at: p.created_at as number,
    })),
  );

  const lastPhoto = photos[photos.length - 1];
  const nextCursor = hasMore && lastPhoto ? btoa(`${lastPhoto.created_at}:${lastPhoto.id}`) : null;

  return c.json({ photos: photosWithUrls, next_cursor: nextCursor }, 200);
});

// ========== GET /receiver/photos/:photoId/download ==========

const downloadRoute = createRoute({
  method: "get",
  path: "/photos/{photoId}/download",
  tags: ["Receiver"],
  summary: "オリジナルDL用Presigned URL発行",
  request: {
    params: z.object({
      photoId: z
        .string()
        .uuid({ version: "v4" })
        .openapi({ param: { name: "photoId", in: "path" } }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            download_url: z.string(),
            filename: z.string().nullable(),
            file_size: z.number(),
          }),
        },
      },
      description: "ダウンロードURL",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Photo not found",
    },
  },
});

receiver.openapi(downloadRoute, async (c) => {
  const uid = c.get("uid");
  const { photoId } = c.req.valid("param");

  const photo = await c.env.DB.prepare(
    "SELECT r2_key_original, original_filename, file_size FROM photos WHERE id = ? AND receiver_id = ? AND upload_status = 'completed'",
  )
    .bind(photoId, uid)
    .first();

  if (!photo) {
    return c.json({ error: { code: "NOT_FOUND", message: "Photo not found" } }, 404);
  }

  const downloadUrl = await createDownloadUrl(c.env, photo.r2_key_original as string);

  return c.json(
    {
      download_url: downloadUrl,
      filename: photo.original_filename as string | null,
      file_size: photo.file_size as number,
    },
    200,
  );
});

// ========== DELETE /receiver/photos/:photoId ==========

const deletePhotoRoute = createRoute({
  method: "delete",
  path: "/photos/{photoId}",
  tags: ["Receiver"],
  summary: "写真削除",
  request: {
    params: z.object({
      photoId: z
        .string()
        .uuid({ version: "v4" })
        .openapi({ param: { name: "photoId", in: "path" } }),
    }),
  },
  responses: {
    204: { description: "削除成功" },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Photo not found",
    },
  },
});

receiver.openapi(deletePhotoRoute, async (c) => {
  const uid = c.get("uid");
  const { photoId } = c.req.valid("param");

  const photo = await c.env.DB.prepare(
    "SELECT r2_key_original, r2_key_thumb, file_size, thumb_size FROM photos WHERE id = ? AND receiver_id = ?",
  )
    .bind(photoId, uid)
    .first();

  if (!photo) {
    return c.json({ error: { code: "NOT_FOUND", message: "Photo not found" } }, 404);
  }

  // R2削除 + D1削除 + クォータ減算を並列実行
  await Promise.all([
    c.env.R2_ORIGINALS.delete(photo.r2_key_original as string),
    c.env.R2_THUMBS.delete(photo.r2_key_thumb as string),
    c.env.DB.prepare("DELETE FROM photos WHERE id = ?").bind(photoId).run(),
    subtractStorageUsage(c.env.DB, uid, (photo.file_size as number) + (photo.thumb_size as number)),
  ]);

  return c.body(null, 204);
});

// ========== DELETE /receiver/photos (Batch) ==========

const batchDeleteRoute = createRoute({
  method: "delete",
  path: "/photos",
  tags: ["Receiver"],
  summary: "写真一括削除",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            photo_ids: z
              .array(z.string().uuid({ version: "v4" }))
              .min(1)
              .max(100),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.object({ deleted_count: z.number() }) },
      },
      description: "削除結果",
    },
  },
});

receiver.openapi(batchDeleteRoute, async (c) => {
  const uid = c.get("uid");
  const { photo_ids } = c.req.valid("json");

  // 対象の写真を取得
  const placeholders = photo_ids.map(() => "?").join(",");
  const photos = await c.env.DB.prepare(
    `SELECT id, r2_key_original, r2_key_thumb, file_size, thumb_size FROM photos WHERE id IN (${placeholders}) AND receiver_id = ?`,
  )
    .bind(...photo_ids, uid)
    .all();

  if (photos.results.length === 0) {
    return c.json({ deleted_count: 0 }, 200);
  }

  // R2削除 + D1削除 + クォータ減算
  const totalBytes = photos.results.reduce(
    (sum, p) => sum + (p.file_size as number) + (p.thumb_size as number),
    0,
  );
  const ids = photos.results.map((p) => p.id as string);
  const delPlaceholders = ids.map(() => "?").join(",");

  await Promise.all([
    ...photos.results.map((p) => c.env.R2_ORIGINALS.delete(p.r2_key_original as string)),
    ...photos.results.map((p) => c.env.R2_THUMBS.delete(p.r2_key_thumb as string)),
    c.env.DB.prepare(`DELETE FROM photos WHERE id IN (${delPlaceholders}) AND receiver_id = ?`)
      .bind(...ids, uid)
      .run(),
    subtractStorageUsage(c.env.DB, uid, totalBytes),
  ]);

  return c.json({ deleted_count: photos.results.length }, 200);
});

// ========== GET /receiver/quota ==========

const quotaRoute = createRoute({
  method: "get",
  path: "/quota",
  tags: ["Receiver"],
  summary: "ストレージ使用状況",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            storage_used: z.number(),
            storage_quota: z.number(),
            usage_percent: z.number(),
            photo_count: z.number(),
          }),
        },
      },
      description: "クォータ情報",
    },
  },
});

receiver.openapi(quotaRoute, async (c) => {
  const uid = c.get("uid");

  const [user, countResult] = await Promise.all([
    c.env.DB.prepare("SELECT storage_used, storage_quota FROM users WHERE id = ?")
      .bind(uid)
      .first(),
    c.env.DB.prepare(
      "SELECT COUNT(*) as count FROM photos WHERE receiver_id = ? AND upload_status = 'completed'",
    )
      .bind(uid)
      .first(),
  ]);

  const storageUsed = (user?.storage_used as number) ?? 0;
  const storageQuota = (user?.storage_quota as number) ?? 10737418240;
  const photoCount = (countResult?.count as number) ?? 0;

  return c.json(
    {
      storage_used: storageUsed,
      storage_quota: storageQuota,
      usage_percent: Math.round((storageUsed / storageQuota) * 1000) / 10,
      photo_count: photoCount,
    },
    200,
  );
});

export default receiver;
