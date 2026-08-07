import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { subtractStorageUsage } from "../lib/quota";
import { createDownloadUrl, createThumbViewUrl, createViewUrl } from "../lib/r2";
import { defaultHook, ErrorSchema } from "../lib/schema";
import { requireAuth } from "../middleware/auth";
import type { AuthEnv } from "../types";

const receiver = new OpenAPIHono<AuthEnv>({ defaultHook });

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
                file_size: z.number(),
                width: z.number().nullable(),
                height: z.number().nullable(),
                thumb_url: z.string().nullable(),
                created_at: z.number(),
              }),
            ),
            next_cursor: z.string().nullable(),
            /** 受信者の completed photos の合計件数。ページに関わらず常に同じ値 */
            total: z.number(),
            /** 日付別件数 (JST)。初回フェッチ (cursor なし) のみ非 null */
            date_counts: z.array(z.object({ key: z.string(), count: z.number() })).nullable(),
            /** 送信者別件数。匿名は key="__anonymous__"。初回フェッチ (cursor なし) のみ非 null */
            sender_counts: z.array(z.object({ key: z.string(), count: z.number() })).nullable(),
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
    "SELECT id, sender_name, camera_model, file_size, width, height, r2_key_thumb, batch_index, created_at FROM photos WHERE receiver_id = ? AND upload_status = 'completed'";
  const params: (string | number)[] = [uid];

  if (cursor) {
    // カーソル = Base64エンコードされた created_at:batch_index:id
    // ギャラリー順: created_at DESC, batch_index ASC, id DESC
    const decoded = atob(cursor);
    const [cursorCreatedAt, cursorBatchIndex, cursorId] = decoded.split(":");
    query += `
       AND (created_at < ?
         OR (created_at = ? AND batch_index > ?)
         OR (created_at = ? AND batch_index = ? AND id < ?))`;
    params.push(
      Number(cursorCreatedAt),
      Number(cursorCreatedAt),
      Number(cursorBatchIndex),
      Number(cursorCreatedAt),
      Number(cursorBatchIndex),
      cursorId,
    );
  }

  query += " ORDER BY created_at DESC, batch_index ASC, id DESC LIMIT ?";
  params.push(limit + 1); // 1件多く取得してnext_cursorを判定

  // 集計は初回フェッチ (cursor なし) のみ。後続ページでは photos データだけ返す
  const [result, totalResult, dateCountsResult, senderCountsResult] = await Promise.all([
    c.env.DB.prepare(query)
      .bind(...params)
      .all(),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM photos WHERE receiver_id = ? AND upload_status = 'completed'",
    )
      .bind(uid)
      .first<{ count: number }>(),
    cursor
      ? null
      : c.env.DB.prepare(
          // JST 日付 (UTC+9) で集計し、ISO 8601 'YYYY-MM-DD' をキーにする
          "SELECT strftime('%Y-%m-%d', datetime(created_at + 9*3600, 'unixepoch')) AS key, " +
            "COUNT(*) AS count FROM photos " +
            "WHERE receiver_id = ? AND upload_status = 'completed' GROUP BY key ORDER BY key DESC",
        )
          .bind(uid)
          .all<{ key: string; count: number }>(),
    cursor
      ? null
      : c.env.DB.prepare(
          // 匿名 (NULL) は固定キー __anonymous__ で集計
          "SELECT COALESCE(sender_name, '__anonymous__') AS key, COUNT(*) AS count FROM photos " +
            "WHERE receiver_id = ? AND upload_status = 'completed' GROUP BY key ORDER BY count DESC",
        )
          .bind(uid)
          .all<{ key: string; count: number }>(),
  ]);

  const total = totalResult?.count ?? 0;
  const dateCounts = dateCountsResult?.results ?? null;
  const senderCounts = senderCountsResult?.results ?? null;
  const hasMore = result.results.length > limit;
  const photos = hasMore ? result.results.slice(0, limit) : result.results;

  const photosWithUrls = await Promise.all(
    photos.map(async (p) => ({
      id: p.id as string,
      sender_name: p.sender_name as string | null,
      camera_model: p.camera_model as string | null,
      file_size: p.file_size as number,
      width: p.width as number | null,
      height: p.height as number | null,
      thumb_url: await createThumbViewUrl(c.env, p.r2_key_thumb as string),
      created_at: p.created_at as number,
    })),
  );

  const lastPhoto = photos[photos.length - 1];
  const nextCursor =
    hasMore && lastPhoto
      ? btoa(`${lastPhoto.created_at}:${lastPhoto.batch_index}:${lastPhoto.id}`)
      : null;

  return c.json(
    {
      photos: photosWithUrls,
      next_cursor: nextCursor,
      total,
      date_counts: dateCounts,
      sender_counts: senderCounts,
    },
    200,
  );
});

// ========== GET /receiver/photo-ids ==========

const listPhotoIdsRoute = createRoute({
  method: "get",
  path: "/photo-ids",
  tags: ["Receiver"],
  summary: "フィルタ条件に合致する写真IDの一覧 (ギャラリーのグループ選択用)",
  request: {
    query: z.object({
      /** sender_name の完全一致。空文字列は匿名 (NULL) を意味する */
      sender: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            photo_ids: z.array(z.string()),
          }),
        },
      },
      description: "写真ID一覧",
    },
  },
});

receiver.openapi(listPhotoIdsRoute, async (c) => {
  const uid = c.get("uid");
  const { sender } = c.req.valid("query");

  let query = "SELECT id FROM photos WHERE receiver_id = ? AND upload_status = 'completed'";
  const params: (string | number)[] = [uid];

  if (sender === "") {
    query += " AND sender_name IS NULL";
  } else {
    query += " AND sender_name = ?";
    params.push(sender);
  }
  query += " ORDER BY created_at DESC, id DESC";

  const result = await c.env.DB.prepare(query)
    .bind(...params)
    .all();

  return c.json(
    {
      photo_ids: result.results.map((r) => r.id as string),
    },
    200,
  );
});

// ========== GET /receiver/photos/:photoId ==========

const getPhotoRoute = createRoute({
  method: "get",
  path: "/photos/{photoId}",
  tags: ["Receiver"],
  summary: "写真詳細取得",
  request: {
    params: z.object({
      photoId: z
        .string()
        .uuid({ version: "v4" })
        .openapi({ param: { name: "photoId", in: "path" } }),
    }),
    query: z.object({
      /** ギャラリー表示モード。prev/next をそのスコープに限定する */
      group: z.enum(["none", "date", "sender"]).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            photo: z.object({
              id: z.string(),
              sender_name: z.string().nullable(),
              camera_model: z.string().nullable(),
              file_size: z.number(),
              width: z.number().nullable(),
              height: z.number().nullable(),
              thumb_url: z.string().nullable(),
              view_url: z.string().nullable(),
              created_at: z.number(),
            }),
            /** ギャラリー表示順 (created_at DESC, id DESC) で一つ前 (=より新しい) の写真ID */
            prev_id: z.string().nullable(),
            /** ギャラリー表示順で一つ次 (=より古い) の写真ID */
            next_id: z.string().nullable(),
          }),
        },
      },
      description: "写真詳細",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Photo not found",
    },
  },
});

receiver.openapi(getPhotoRoute, async (c) => {
  const uid = c.get("uid");
  const { photoId } = c.req.valid("param");
  const { group } = c.req.valid("query");

  const photo = await c.env.DB.prepare(
    "SELECT id, sender_name, camera_model, file_size, width, height, r2_key_original, r2_key_thumb, batch_index, created_at FROM photos WHERE id = ? AND receiver_id = ? AND upload_status = 'completed'",
  )
    .bind(photoId, uid)
    .first();

  if (!photo) {
    return c.json({ error: { code: "NOT_FOUND", message: "Photo not found" } }, 404);
  }

  const createdAt = photo.created_at as number;
  const batchIndex = photo.batch_index as number;
  const currentId = photo.id as string;
  const senderName = photo.sender_name as string | null;

  // sender モードでは同一 sender_name (または NULL) 内に限定
  const senderScope = group === "sender";
  const senderCondition = senderScope
    ? senderName === null
      ? " AND sender_name IS NULL"
      : " AND sender_name = ?"
    : "";
  const buildNeighborBindings = (base: (string | number)[]) =>
    senderScope && senderName !== null ? [...base, senderName] : base;

  // ギャラリー順: created_at DESC, batch_index ASC, id DESC
  // prev (= 新しい方向): current より「上」にある最も近いもの → 逆順ソートで先頭
  // next (= 古い方向): current より「下」にある最も近いもの → ギャラリー順で先頭
  const [thumbUrl, viewUrl, prevRow, nextRow] = await Promise.all([
    createThumbViewUrl(c.env, photo.r2_key_thumb as string),
    createViewUrl(c.env, photo.r2_key_original as string),
    c.env.DB.prepare(
      `SELECT id FROM photos
         WHERE receiver_id = ? AND upload_status = 'completed'
           AND (
             created_at > ?
             OR (created_at = ? AND batch_index < ?)
             OR (created_at = ? AND batch_index = ? AND id > ?)
           )${senderCondition}
         ORDER BY created_at ASC, batch_index DESC, id ASC LIMIT 1`,
    )
      .bind(
        ...buildNeighborBindings([
          uid,
          createdAt,
          createdAt,
          batchIndex,
          createdAt,
          batchIndex,
          currentId,
        ]),
      )
      .first(),
    c.env.DB.prepare(
      `SELECT id FROM photos
         WHERE receiver_id = ? AND upload_status = 'completed'
           AND (
             created_at < ?
             OR (created_at = ? AND batch_index > ?)
             OR (created_at = ? AND batch_index = ? AND id < ?)
           )${senderCondition}
         ORDER BY created_at DESC, batch_index ASC, id DESC LIMIT 1`,
    )
      .bind(
        ...buildNeighborBindings([
          uid,
          createdAt,
          createdAt,
          batchIndex,
          createdAt,
          batchIndex,
          currentId,
        ]),
      )
      .first(),
  ]);

  return c.json(
    {
      photo: {
        id: currentId,
        sender_name: photo.sender_name as string | null,
        camera_model: photo.camera_model as string | null,
        file_size: photo.file_size as number,
        width: photo.width as number | null,
        height: photo.height as number | null,
        thumb_url: thumbUrl,
        view_url: viewUrl,
        created_at: createdAt,
      },
      prev_id: (prevRow?.id as string | undefined) ?? null,
      next_id: (nextRow?.id as string | undefined) ?? null,
    },
    200,
  );
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

  // session_index: 同一セッション内でこの写真が何枚目か (1-based)
  const photo = await c.env.DB.prepare(
    `SELECT p.r2_key_original, p.file_size, p.created_at,
       (SELECT COUNT(*) FROM photos p2
          WHERE p2.session_id IS NOT NULL
            AND p2.session_id = p.session_id
            AND p2.upload_status = 'completed'
            AND (p2.created_at < p.created_at
              OR (p2.created_at = p.created_at AND p2.id <= p.id))
       ) as session_index
     FROM photos p
     WHERE p.id = ? AND p.receiver_id = ? AND p.upload_status = 'completed'`,
  )
    .bind(photoId, uid)
    .first();

  if (!photo) {
    return c.json({ error: { code: "NOT_FOUND", message: "Photo not found" } }, 404);
  }

  const filename = buildDownloadFilename(
    photo.created_at as number,
    (photo.session_index as number) || 1,
  );
  const downloadUrl = await createDownloadUrl(c.env, photo.r2_key_original as string, filename);

  return c.json(
    {
      download_url: downloadUrl,
      filename,
      file_size: photo.file_size as number,
    },
    200,
  );
});

/** 受信日時_連番.jpg 形式のファイル名を生成 (JST基準) */
function buildDownloadFilename(createdAt: number, sessionIndex: number): string {
  const jst = new Date((createdAt + 9 * 3600) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${jst.getUTCFullYear()}${pad(jst.getUTCMonth() + 1)}${pad(jst.getUTCDate())}`;
  const time = `${pad(jst.getUTCHours())}${pad(jst.getUTCMinutes())}${pad(jst.getUTCSeconds())}`;
  const idx = String(sessionIndex).padStart(2, "0");
  return `${date}-${time}_${idx}.jpg`;
}

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

  // DB操作を先行 (不整合時はクリーンアップジョブがR2孤立オブジェクトを回収)
  await Promise.all([
    c.env.DB.prepare("DELETE FROM photos WHERE id = ? AND receiver_id = ?")
      .bind(photoId, uid)
      .run(),
    subtractStorageUsage(c.env.DB, uid, (photo.file_size as number) + (photo.thumb_size as number)),
  ]);

  // R2削除は後続 (失敗してもDBは整合、孤立オブジェクトはCronで回収)
  await Promise.all([
    c.env.R2_ORIGINALS.delete(photo.r2_key_original as string),
    c.env.R2_THUMBS.delete(photo.r2_key_thumb as string),
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

  const totalBytes = photos.results.reduce(
    (sum, p) => sum + (p.file_size as number) + (p.thumb_size as number),
    0,
  );
  const ids = photos.results.map((p) => p.id as string);
  const delPlaceholders = ids.map(() => "?").join(",");

  // DB操作を先行
  await Promise.all([
    c.env.DB.prepare(`DELETE FROM photos WHERE id IN (${delPlaceholders}) AND receiver_id = ?`)
      .bind(...ids, uid)
      .run(),
    subtractStorageUsage(c.env.DB, uid, totalBytes),
  ]);

  // R2削除は後続 (失敗してもDBは整合、孤立オブジェクトはCronで回収)
  await Promise.all([
    ...photos.results.map((p) => c.env.R2_ORIGINALS.delete(p.r2_key_original as string)),
    ...photos.results.map((p) => c.env.R2_THUMBS.delete(p.r2_key_thumb as string)),
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
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "未登録ユーザー",
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

  if (!user) {
    return c.json({ error: { code: "NOT_FOUND", message: "User not registered" } }, 404);
  }

  const storageUsed = user.storage_used as number;
  const storageQuota = user.storage_quota as number;
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
