import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { addStorageUsage } from "../lib/quota";
import { buildR2Key, createThumbUploadUrl, createThumbViewUrl, createUploadUrl } from "../lib/r2";
import { ErrorSchema, HandleParam, PhotoIdParam, SessionIdParam } from "../lib/schema";
import type { Env } from "../types";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const sender = new OpenAPIHono<{ Bindings: Env }>();

// ========== GET /send/:handle ==========

const getReceiverRoute = createRoute({
  method: "get",
  path: "/{handle}",
  tags: ["Sender"],
  summary: "受信者の公開プロフィール取得",
  request: { params: HandleParam },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            receiver: z.object({
              handle: z.string(),
              display_name: z.string(),
              avatar_url: z.string().nullable(),
              is_accepting: z.boolean(),
            }),
          }),
        },
      },
      description: "受信者プロフィール",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "User not found",
    },
  },
});

sender.openapi(getReceiverRoute, async (c) => {
  const { handle } = c.req.valid("param");

  const user = await c.env.DB.prepare(
    "SELECT handle, display_name, avatar_url, is_active, storage_used, storage_quota FROM users WHERE handle = ?",
  )
    .bind(handle)
    .first();

  if (!user) {
    return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  }

  const isAccepting =
    user.is_active === 1 && (user.storage_used as number) < (user.storage_quota as number);

  return c.json(
    {
      receiver: {
        handle: user.handle as string,
        display_name: user.display_name as string,
        avatar_url: user.avatar_url as string | null,
        is_accepting: isAccepting,
      },
    },
    200,
  );
});

// ========== POST /send/:handle/sessions ==========

const createSessionRoute = createRoute({
  method: "post",
  path: "/{handle}/sessions",
  tags: ["Sender"],
  summary: "アップロードセッション作成",
  request: {
    params: HandleParam,
    body: {
      content: {
        "application/json": {
          schema: z.object({
            sender_name: z.string().optional(),
            photo_count: z.number().int().min(1),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({
            session_id: z.string().uuid(),
            expires_at: z.number(),
          }),
        },
      },
      description: "セッション作成成功",
    },
    403: { content: { "application/json": { schema: ErrorSchema } }, description: "受付停止中" },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "User not found",
    },
    507: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "クォータ超過",
    },
  },
});

sender.openapi(createSessionRoute, async (c) => {
  const { handle } = c.req.valid("param");
  const body = c.req.valid("json");

  const user = await c.env.DB.prepare(
    "SELECT id, is_active, storage_used, storage_quota FROM users WHERE handle = ?",
  )
    .bind(handle)
    .first();

  if (!user) {
    return c.json({ error: { code: "NOT_FOUND", message: "User not found" } }, 404);
  }

  if (user.is_active !== 1) {
    return c.json(
      { error: { code: "FORBIDDEN", message: "This user is not accepting photos" } },
      403,
    );
  }

  if ((user.storage_used as number) >= (user.storage_quota as number)) {
    return c.json(
      { error: { code: "QUOTA_EXCEEDED", message: "Receiver storage quota exceeded" } },
      507,
    );
  }

  const sessionId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 3600;

  await c.env.DB.prepare(
    `INSERT INTO upload_sessions (id, receiver_id, sender_name, photo_count, status, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
  )
    .bind(sessionId, user.id, body.sender_name ?? null, body.photo_count, expiresAt, now, now)
    .run();

  return c.json({ session_id: sessionId, expires_at: expiresAt }, 201);
});

// ========== POST /send/:handle/sessions/:sessionId/photos ==========

const PhotoInput = z.object({
  filename: z.string(),
  file_size: z.number().int().min(1).max(MAX_FILE_SIZE),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  camera_model: z.string().optional(),
  watermark_text: z.string().optional(),
});

const createPhotosRoute = createRoute({
  method: "post",
  path: "/{handle}/sessions/{sessionId}/photos",
  tags: ["Sender"],
  summary: "Presigned URL発行 (バッチ対応)",
  request: {
    params: HandleParam.merge(SessionIdParam),
    body: {
      content: {
        "application/json": {
          schema: z.object({ photos: z.array(PhotoInput).min(1) }),
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({
            uploads: z.array(
              z.object({
                photo_id: z.string().uuid(),
                upload_url: z.string().url(),
                thumb_upload_url: z.string().url(),
              }),
            ),
            expires_in: z.number(),
          }),
        },
      },
      description: "Presigned URL発行成功",
    },
    403: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "セッション無効",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Session not found",
    },
    507: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "クォータ超過",
    },
  },
});

sender.openapi(createPhotosRoute, async (c) => {
  const { handle, sessionId } = c.req.valid("param");
  const { photos } = c.req.valid("json");

  const session = await c.env.DB.prepare(
    `SELECT s.id, s.receiver_id, s.status, s.expires_at, u.handle, u.storage_used, u.storage_quota
     FROM upload_sessions s
     JOIN users u ON u.id = s.receiver_id
     WHERE s.id = ? AND u.handle = ?`,
  )
    .bind(sessionId, handle)
    .first();

  if (!session) {
    return c.json({ error: { code: "NOT_FOUND", message: "Session not found" } }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  if (session.status !== "active" || (session.expires_at as number) < now) {
    return c.json({ error: { code: "FORBIDDEN", message: "Session expired or inactive" } }, 403);
  }

  // 楽観的クォータチェック
  const totalSize = photos.reduce((sum, p) => sum + p.file_size, 0);
  const remaining = (session.storage_quota as number) - (session.storage_used as number);
  if (totalSize > remaining) {
    return c.json(
      { error: { code: "QUOTA_EXCEEDED", message: "Upload would exceed storage quota" } },
      507,
    );
  }

  // 各写真のレコード作成 + Presigned URL発行
  const uploads = await Promise.all(
    photos.map(async (photo) => {
      const photoId = crypto.randomUUID();
      const r2KeyOriginal = buildR2Key(handle, photoId, "original");
      const r2KeyThumb = buildR2Key(handle, photoId, "thumb");

      await c.env.DB.prepare(
        `INSERT INTO photos (id, receiver_id, session_id, r2_key_original, r2_key_thumb,
          sender_name, camera_model, watermark_text, original_filename,
          file_size, width, height, upload_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
        .bind(
          photoId,
          session.receiver_id,
          sessionId,
          r2KeyOriginal,
          r2KeyThumb,
          null,
          photo.camera_model ?? null,
          photo.watermark_text ?? null,
          photo.filename,
          photo.file_size,
          photo.width ?? null,
          photo.height ?? null,
          now,
          now,
        )
        .run();

      const [uploadUrl, thumbUploadUrl] = await Promise.all([
        createUploadUrl(c.env, r2KeyOriginal, photo.file_size),
        createThumbUploadUrl(c.env, r2KeyThumb),
      ]);

      return { photo_id: photoId, upload_url: uploadUrl, thumb_upload_url: thumbUploadUrl };
    }),
  );

  await c.env.DB.prepare(
    `UPDATE upload_sessions SET total_size = total_size + ?, photo_count = photo_count + ?, updated_at = ? WHERE id = ?`,
  )
    .bind(totalSize, photos.length, now, sessionId)
    .run();

  return c.json({ uploads, expires_in: 900 }, 201);
});

// ========== PATCH /send/:handle/sessions/:sessionId/photos/:photoId/confirm ==========

const confirmPhotoRoute = createRoute({
  method: "patch",
  path: "/{handle}/sessions/{sessionId}/photos/{photoId}/confirm",
  tags: ["Sender"],
  summary: "アップロード完了確認",
  request: {
    params: HandleParam.merge(SessionIdParam).merge(PhotoIdParam),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            photo_id: z.string().uuid(),
            upload_status: z.literal("completed"),
          }),
        },
      },
      description: "確認成功",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "バリデーションエラー",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Photo not found",
    },
    507: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "クォータ超過",
    },
  },
});

sender.openapi(confirmPhotoRoute, async (c) => {
  const { handle, sessionId, photoId } = c.req.valid("param");

  const photo = await c.env.DB.prepare(
    `SELECT p.id, p.receiver_id, p.r2_key_original, p.r2_key_thumb, p.file_size, p.upload_status
       FROM photos p
       JOIN upload_sessions s ON s.id = p.session_id
       JOIN users u ON u.id = s.receiver_id
       WHERE p.id = ? AND p.session_id = ? AND u.handle = ?`,
  )
    .bind(photoId, sessionId, handle)
    .first();

  if (!photo) {
    return c.json({ error: { code: "NOT_FOUND", message: "Photo not found" } }, 404);
  }

  if (photo.upload_status !== "pending") {
    return c.json(
      { error: { code: "INVALID_REQUEST", message: "Photo already confirmed or failed" } },
      400,
    );
  }

  // オリジナル・サムネイルの存在確認 + サイズ検証をサーバー側で実施
  const [r2Head, thumbHead] = await Promise.all([
    c.env.R2_ORIGINALS.head(photo.r2_key_original as string),
    c.env.R2_THUMBS.head(photo.r2_key_thumb as string),
  ]);

  if (!r2Head) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Original file not found in storage" } },
      404,
    );
  }

  if (r2Head.size !== (photo.file_size as number)) {
    await c.env.R2_ORIGINALS.delete(photo.r2_key_original as string);
    await c.env.R2_THUMBS.delete(photo.r2_key_thumb as string);
    return c.json({ error: { code: "INVALID_REQUEST", message: "File size mismatch" } }, 400);
  }

  const thumbSize = thumbHead?.size ?? 0;

  // クォータ加算: オリジナル + サムネイル (削除時の減算と対称)
  const quotaOk = await addStorageUsage(
    c.env.DB,
    photo.receiver_id as string,
    (photo.file_size as number) + thumbSize,
  );

  if (!quotaOk) {
    await c.env.R2_ORIGINALS.delete(photo.r2_key_original as string);
    await c.env.R2_THUMBS.delete(photo.r2_key_thumb as string);
    return c.json({ error: { code: "QUOTA_EXCEEDED", message: "Storage quota exceeded" } }, 507);
  }

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `UPDATE photos SET upload_status = 'completed', thumb_size = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(thumbSize, now, photoId)
    .run();

  return c.json({ photo_id: photoId, upload_status: "completed" as const }, 200);
});

// ========== GET /send/:handle/sessions/:sessionId ==========

const getSessionRoute = createRoute({
  method: "get",
  path: "/{handle}/sessions/{sessionId}",
  tags: ["Sender"],
  summary: "セッション内写真一覧",
  request: { params: HandleParam.merge(SessionIdParam) },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            session_id: z.string().uuid(),
            photos: z.array(
              z.object({
                photo_id: z.string().uuid(),
                thumb_url: z.string().url().nullable(),
                filename: z.string().nullable(),
                status: z.string(),
              }),
            ),
          }),
        },
      },
      description: "セッション写真一覧",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Session not found",
    },
  },
});

sender.openapi(getSessionRoute, async (c) => {
  const { handle, sessionId } = c.req.valid("param");

  const session = await c.env.DB.prepare(
    `SELECT s.id, s.expires_at
     FROM upload_sessions s
     JOIN users u ON u.id = s.receiver_id
     WHERE s.id = ? AND u.handle = ?`,
  )
    .bind(sessionId, handle)
    .first();

  if (!session) {
    return c.json({ error: { code: "NOT_FOUND", message: "Session not found" } }, 404);
  }

  const now = Math.floor(Date.now() / 1000);
  if ((session.expires_at as number) < now) {
    return c.json({ error: { code: "NOT_FOUND", message: "Session expired" } }, 404);
  }

  const photos = await c.env.DB.prepare(
    `SELECT id, r2_key_thumb, original_filename, upload_status
     FROM photos WHERE session_id = ? ORDER BY created_at ASC`,
  )
    .bind(sessionId)
    .all();

  const photosWithUrls = await Promise.all(
    photos.results.map(async (p) => ({
      photo_id: p.id as string,
      thumb_url:
        p.upload_status === "completed"
          ? await createThumbViewUrl(c.env, p.r2_key_thumb as string)
          : null,
      filename: p.original_filename as string | null,
      status: p.upload_status as string,
    })),
  );

  return c.json({ session_id: sessionId, photos: photosWithUrls }, 200);
});

export default sender;
