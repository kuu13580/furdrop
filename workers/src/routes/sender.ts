import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { asBool } from "../lib/d1";
import { addStorageUsage } from "../lib/quota";
import { buildR2Key, createThumbUploadUrl, createThumbViewUrl, createUploadUrl } from "../lib/r2";
import { defaultHook, ErrorSchema, HandleParam, PhotoIdParam, SessionIdParam } from "../lib/schema";
import type { Env } from "../types";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_PHOTOS_PER_SESSION = 100;

const sender = new OpenAPIHono<{ Bindings: Env }>({ defaultHook });

const EmbedModeSchema = z.enum(["disabled", "optional", "required"]);
type EmbedMode = z.infer<typeof EmbedModeSchema>;

function asMode(v: unknown): EmbedMode {
  return v === "required" || v === "optional" ? v : "disabled";
}

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
              // キー必須かどうか。送信者側で「?k= の無いURLが正当か」を判断するために公開する
              require_send_key: z.boolean(),
              options: z.object({
                exif_embed_mode: EmbedModeSchema,
                watermark_mode: EmbedModeSchema,
                require_sender_name: z.boolean(),
              }),
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
    429: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "レート制限",
    },
  },
});

sender.openapi(getReceiverRoute, async (c) => {
  const { handle } = c.req.valid("param");

  // handle 列挙の速度を落とす。キーを外した受信者 (require_send_key=0) は
  // handle さえ当てれば送信できてしまうので、その探索コストを上げておく
  const senderIp = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success: rateLimitOk } = await c.env.RATE_LIMITER_PROFILE.limit({ key: senderIp });
  if (!rateLimitOk) {
    c.header("Retry-After", "60");
    return c.json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, 429);
  }

  const user = await c.env.DB.prepare(
    "SELECT handle, display_name, avatar_url, is_active, storage_used, storage_quota, exif_embed_mode, watermark_mode, require_sender_name, require_send_key FROM users WHERE handle = ?",
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
        require_send_key: asBool(user.require_send_key),
        options: {
          exif_embed_mode: asMode(user.exif_embed_mode),
          watermark_mode: asMode(user.watermark_mode),
          require_sender_name: asBool(user.require_sender_name),
        },
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
            // 受信URLの ?k= に乗っているアクセスキー。受信者ごとに発行され、知らない人は送信できない。
            // 受信者が require_send_key を外している場合のみ省略できる。
            key: z.string().min(1).max(128).optional(),
            sender_name: z.string().optional(),
            photo_count: z.number().int().min(1).max(MAX_PHOTOS_PER_SESSION),
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
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "送信者名必須の受信者に対して sender_name 未指定",
    },
    403: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "受付停止中 / アクセスキー不一致",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "User not found",
    },
    429: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "レート制限",
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

  // X05: 送信者IP単位のレート制限（5回 / 60秒）
  const senderIp = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success: rateLimitOk } = await c.env.RATE_LIMITER_SESSION.limit({ key: senderIp });
  if (!rateLimitOk) {
    c.header("Retry-After", "60");
    return c.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many session creations, please try again later",
        },
      },
      429,
    );
  }

  // key の照合は JOIN ではなく EXISTS で取る。require_send_key=0 の受信者は
  // キーを検証せずに通すため、「キーが合わない」と「そもそも要らない」を分けて判定する必要がある。
  const user = await c.env.DB.prepare(
    `SELECT u.id, u.is_active, u.storage_used, u.storage_quota, u.require_sender_name, u.require_send_key,
            EXISTS (SELECT 1 FROM send_keys k WHERE k.receiver_id = u.id AND k.key_value = ?) AS key_matched
       FROM users u
       WHERE u.handle = ?`,
  )
    .bind(body.key ?? "", handle)
    .first();

  // handle が存在しない場合もキー不一致と同じ 403 に寄せる (ハンドルの実在を漏らさない)。
  if (!user) {
    return c.json({ error: { code: "INVALID_KEY", message: "Invalid access key" } }, 403);
  }

  if (asBool(user.require_send_key) && !asBool(user.key_matched)) {
    return c.json({ error: { code: "INVALID_KEY", message: "Invalid access key" } }, 403);
  }

  if (user.is_active !== 1) {
    return c.json(
      { error: { code: "FORBIDDEN", message: "This user is not accepting photos" } },
      403,
    );
  }

  // R14: 受信者が送信者名を必須にしている場合、未指定のセッション開始を拒否 (UIバイパス防止)。
  // EXIF required 由来の名前必須は createPhotos 側の camera_model 検証で担保される
  if (asBool(user.require_sender_name) && !body.sender_name?.trim()) {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Sender name is required by this receiver",
        },
      },
      400,
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

  // 発信者情報開示請求対応のため、送信時のIPとUAを記録（保存期間は Cron で最低3か月=100日に制限）
  // 上の rate limit 用 senderIp を再利用（"unknown" はそのまま記録される — DB保存上は意味のある値）
  const senderIpForLog = senderIp === "unknown" ? null : senderIp;
  const senderUa = c.req.header("User-Agent") ?? null;

  await c.env.DB.prepare(
    `INSERT INTO upload_sessions (id, receiver_id, sender_name, photo_count, status, expires_at, sender_ip, sender_ua, created_at, updated_at)
     VALUES (?, ?, ?, 0, 'active', ?, ?, ?, ?, ?)`,
  )
    .bind(
      sessionId,
      user.id,
      body.sender_name ?? null,
      expiresAt,
      senderIpForLog,
      senderUa,
      now,
      now,
    )
    .run();

  return c.json({ session_id: sessionId, expires_at: expiresAt }, 201);
});

// ========== POST /send/:handle/sessions/:sessionId/photos ==========

const MAX_THUMB_SIZE = 512 * 1024; // 512KB (r2.ts と同期)

const PhotoInput = z.object({
  filename: z.string(),
  file_size: z.number().int().min(1).max(MAX_FILE_SIZE),
  thumb_size: z.number().int().min(1).max(MAX_THUMB_SIZE),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  camera_model: z.string().optional(),
  watermark_text: z.string().max(4000).optional(),
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
          schema: z.object({ photos: z.array(PhotoInput).min(1).max(MAX_PHOTOS_PER_SESSION) }),
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
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "枚数上限超過",
    },
    403: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "セッション無効",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Session not found",
    },
    429: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "レート制限",
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

  // X05: 送信者IP単位のレート制限（30回 / 60秒）
  const senderIp = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success: rateLimitOk } = await c.env.RATE_LIMITER_PHOTOS.limit({ key: senderIp });
  if (!rateLimitOk) {
    c.header("Retry-After", "60");
    return c.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many photo upload requests, please try again later",
        },
      },
      429,
    );
  }

  const session = await c.env.DB.prepare(
    `SELECT s.id, s.receiver_id, s.sender_name, s.status, s.expires_at, s.photo_count,
            u.handle, u.storage_used, u.storage_quota, u.exif_embed_mode, u.watermark_mode
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

  // セッション累積枚数チェック (X03: 1セッション最大100枚)
  const currentCount = session.photo_count as number;
  if (currentCount + photos.length > MAX_PHOTOS_PER_SESSION) {
    return c.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: `Session photo limit exceeded (current: ${currentCount}, requested: ${photos.length}, max: ${MAX_PHOTOS_PER_SESSION})`,
        },
      },
      400,
    );
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

  // R14: 受信者の埋め込みモードに応じてサーバ側で必須/拒否を強制
  // - 'required'  : 該当フィールドが空ならエラー (UIバイパス防止)
  // - 'disabled'  : 受信者の意向を尊重してサーバ側でフィールドを無視
  // - 'optional'  : 送信者の入力をそのまま採用
  const exifMode = asMode(session.exif_embed_mode);
  const watermarkMode = asMode(session.watermark_mode);
  for (const p of photos) {
    if (exifMode === "required" && !p.camera_model?.trim()) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "EXIF sender info is required by this receiver",
          },
        },
        400,
      );
    }
    if (watermarkMode === "required" && !p.watermark_text?.trim()) {
      return c.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Watermark is required by this receiver",
          },
        },
        400,
      );
    }
  }

  // 既存のセッション内写真枚数を取得 (複数バッチでも連番になるよう batch_index を累積)
  const baseBatchIndex = currentCount;

  // 各写真のレコード作成 + Presigned URL発行
  const uploads = await Promise.all(
    photos.map(async (photo, i) => {
      const photoId = crypto.randomUUID();
      const r2KeyOriginal = buildR2Key(handle, photoId, "original");
      const r2KeyThumb = buildR2Key(handle, photoId, "thumb");
      const batchIndex = baseBatchIndex + i;

      const cameraModel = exifMode === "disabled" ? null : (photo.camera_model ?? null);
      const watermarkText = watermarkMode === "disabled" ? null : (photo.watermark_text ?? null);

      await c.env.DB.prepare(
        `INSERT INTO photos (id, receiver_id, session_id, r2_key_original, r2_key_thumb,
          sender_name, camera_model, watermark_text, original_filename,
          file_size, width, height, upload_status, batch_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
        .bind(
          photoId,
          session.receiver_id,
          sessionId,
          r2KeyOriginal,
          r2KeyThumb,
          (session.sender_name as string | null) ?? null,
          cameraModel,
          watermarkText,
          photo.filename,
          photo.file_size,
          photo.width ?? null,
          photo.height ?? null,
          batchIndex,
          now,
          now,
        )
        .run();

      const [uploadUrl, thumbUploadUrl] = await Promise.all([
        createUploadUrl(c.env, r2KeyOriginal, photo.file_size),
        createThumbUploadUrl(c.env, r2KeyThumb, photo.thumb_size),
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
    415: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "画像フォーマット不正",
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

  // X10: マジックバイト検証 (JPEG: FF D8 FF)
  const r2Obj = await c.env.R2_ORIGINALS.get(photo.r2_key_original as string, {
    range: { offset: 0, length: 3 },
  });
  if (!r2Obj) {
    return c.json(
      { error: { code: "NOT_FOUND", message: "Original file not found in storage" } },
      404,
    );
  }
  const header = new Uint8Array(await r2Obj.arrayBuffer());
  if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) {
    await c.env.R2_ORIGINALS.delete(photo.r2_key_original as string);
    await c.env.R2_THUMBS.delete(photo.r2_key_thumb as string);
    return c.json(
      { error: { code: "INVALID_FORMAT", message: "File is not a valid JPEG image" } },
      415,
    );
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
     FROM photos WHERE session_id = ?
     ORDER BY batch_index ASC, created_at ASC, id ASC`,
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
