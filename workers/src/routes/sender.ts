import { Hono } from "hono";
import { addStorageUsage } from "../lib/quota";
import { buildR2Key, createThumbUploadUrl, createThumbViewUrl, createUploadUrl } from "../lib/r2";
import type { Env } from "../types";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const sender = new Hono<{ Bindings: Env }>();

// ---------- GET /send/:handle ----------
sender.get("/:handle", async (c) => {
  const handle = c.req.param("handle");

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

  return c.json({
    receiver: {
      handle: user.handle,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      is_accepting: isAccepting,
    },
  });
});

// ---------- POST /send/:handle/sessions ----------
sender.post("/:handle/sessions", async (c) => {
  const handle = c.req.param("handle");

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

  const body = await c.req.json<{ sender_name?: string; photo_count: number }>();

  if (!body.photo_count || body.photo_count < 1) {
    return c.json(
      { error: { code: "INVALID_REQUEST", message: "photo_count must be at least 1" } },
      400,
    );
  }

  const sessionId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 3600; // 1時間後

  await c.env.DB.prepare(
    `INSERT INTO upload_sessions (id, receiver_id, sender_name, photo_count, status, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
  )
    .bind(sessionId, user.id, body.sender_name ?? null, body.photo_count, expiresAt, now, now)
    .run();

  return c.json({ session_id: sessionId, expires_at: expiresAt }, 201);
});

// ---------- POST /send/:handle/sessions/:sessionId/photos ----------
sender.post("/:handle/sessions/:sessionId/photos", async (c) => {
  const handle = c.req.param("handle");
  const sessionId = c.req.param("sessionId");

  // セッションと受信者の整合性を検証
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

  const body = await c.req.json<{
    photos: Array<{
      filename: string;
      file_size: number;
      width?: number;
      height?: number;
      camera_model?: string;
      watermark_text?: string;
    }>;
  }>();

  if (!body.photos || body.photos.length === 0) {
    return c.json({ error: { code: "INVALID_REQUEST", message: "photos array is required" } }, 400);
  }

  // ファイルサイズバリデーション
  const totalSize = body.photos.reduce((sum, p) => sum + p.file_size, 0);
  for (const photo of body.photos) {
    if (photo.file_size > MAX_FILE_SIZE) {
      return c.json(
        {
          error: {
            code: "FILE_TOO_LARGE",
            message: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
          },
        },
        413,
      );
    }
  }

  // 楽観的クォータチェック
  const remaining = (session.storage_quota as number) - (session.storage_used as number);
  if (totalSize > remaining) {
    return c.json(
      { error: { code: "QUOTA_EXCEEDED", message: "Upload would exceed storage quota" } },
      507,
    );
  }

  // 各写真のレコード作成 + Presigned URL発行
  const uploads = await Promise.all(
    body.photos.map(async (photo) => {
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
          null, // sender_name はセッションから取得
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

      return {
        photo_id: photoId,
        upload_url: uploadUrl,
        thumb_upload_url: thumbUploadUrl,
      };
    }),
  );

  // セッションの合計サイズ更新
  await c.env.DB.prepare(
    `UPDATE upload_sessions
     SET total_size = total_size + ?, photo_count = photo_count + ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(totalSize, body.photos.length, now, sessionId)
    .run();

  return c.json({ uploads, expires_in: 900 }, 201);
});

// ---------- PATCH /send/:handle/sessions/:sessionId/photos/:photoId/confirm ----------
sender.patch("/:handle/sessions/:sessionId/photos/:photoId/confirm", async (c) => {
  const handle = c.req.param("handle");
  const sessionId = c.req.param("sessionId");
  const photoId = c.req.param("photoId");

  // 写真の所有権チェック (handle → session → photo)
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

  // R2にオブジェクトが存在するか確認 (HEAD)
  const r2Head = await c.env.R2_ORIGINALS.head(photo.r2_key_original as string);

  if (!r2Head) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Original file not found in storage" } },
      404,
    );
  }

  // サイズ照合
  if (r2Head.size !== (photo.file_size as number)) {
    // サイズ不一致: R2オブジェクト削除
    await c.env.R2_ORIGINALS.delete(photo.r2_key_original as string);
    await c.env.R2_THUMBS.delete(photo.r2_key_thumb as string);

    return c.json({ error: { code: "INVALID_REQUEST", message: "File size mismatch" } }, 400);
  }

  // クォータ加算 (アトミック)
  const quotaOk = await addStorageUsage(
    c.env.DB,
    photo.receiver_id as string,
    photo.file_size as number,
  );

  if (!quotaOk) {
    // クォータ超過: R2オブジェクト削除
    await c.env.R2_ORIGINALS.delete(photo.r2_key_original as string);
    await c.env.R2_THUMBS.delete(photo.r2_key_thumb as string);

    return c.json({ error: { code: "QUOTA_EXCEEDED", message: "Storage quota exceeded" } }, 507);
  }

  // サムネイルサイズ取得
  const body = await c.req.json<{ thumb_size?: number }>();
  const thumbSize = body.thumb_size ?? 0;

  const now = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `UPDATE photos SET upload_status = 'completed', thumb_size = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(thumbSize, now, photoId)
    .run();

  return c.json({ photo_id: photoId, upload_status: "completed" });
});

// ---------- GET /send/:handle/sessions/:sessionId ----------
sender.get("/:handle/sessions/:sessionId", async (c) => {
  const handle = c.req.param("handle");
  const sessionId = c.req.param("sessionId");

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
      photo_id: p.id,
      thumb_url:
        p.upload_status === "completed"
          ? await createThumbViewUrl(c.env, p.r2_key_thumb as string)
          : null,
      filename: p.original_filename,
      status: p.upload_status,
    })),
  );

  return c.json({ session_id: sessionId, photos: photosWithUrls });
});

export default sender;
