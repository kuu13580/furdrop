// D1 にテストデータを投入するヘルパー。
// 各テストは自身で必要なレコードを seed() する (固定 fixture は使わない = テスト同士を独立させる)。
import { env } from "cloudflare:test";
import { generateSendKey } from "../../src/lib/send-key";

type SeedUserOptions = {
  uid: string;
  handle: string;
  display_name?: string;
  email?: string;
  storage_used?: number;
  storage_quota?: number;
  is_active?: 0 | 1;
  exif_embed_mode?: "disabled" | "optional" | "required";
  watermark_mode?: "disabled" | "optional" | "required";
};

/** users + send_keys を 1 件ずつ作って key_value を返す。register 後の状態を再現 */
export async function seedUser(
  opts: SeedUserOptions,
): Promise<{ uid: string; handle: string; sendKey: string }> {
  const now = Math.floor(Date.now() / 1000);
  const sendKey = generateSendKey();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, handle, display_name, email, avatar_url, storage_used, storage_quota, is_active, exif_embed_mode, watermark_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      opts.uid,
      opts.handle,
      opts.display_name ?? opts.handle,
      opts.email ?? `${opts.handle}@test.local`,
      opts.storage_used ?? 0,
      opts.storage_quota ?? 10737418240,
      opts.is_active ?? 1,
      opts.exif_embed_mode ?? "optional",
      opts.watermark_mode ?? "disabled",
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO send_keys (id, receiver_id, key_value, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), opts.uid, sendKey, now, now),
  ]);
  return { uid: opts.uid, handle: opts.handle, sendKey };
}

type SeedPhotoOptions = {
  receiverId: string;
  handle: string;
  sessionId?: string;
  status?: "pending" | "completed" | "failed";
  fileSize?: number;
  thumbSize?: number;
  senderName?: string | null;
  createdAt?: number;
};

/** photos に 1 行入れ、(必要なら) R2 にダミーバイトも投入する */
export async function seedPhoto(
  opts: SeedPhotoOptions,
): Promise<{ photoId: string; r2KeyOriginal: string; r2KeyThumb: string }> {
  const now = opts.createdAt ?? Math.floor(Date.now() / 1000);
  const photoId = crypto.randomUUID();
  const yearMonth = `${new Date(now * 1000).getUTCFullYear()}-${String(
    new Date(now * 1000).getUTCMonth() + 1,
  ).padStart(2, "0")}`;
  const r2KeyOriginal = `${opts.handle}/${yearMonth}/${photoId}.jpg`;
  const r2KeyThumb = `${opts.handle}/${yearMonth}/${photoId}_thumb.jpg`;
  const fileSize = opts.fileSize ?? 1024;
  const thumbSize = opts.thumbSize ?? 256;

  await env.DB.prepare(
    `INSERT INTO photos (id, receiver_id, session_id, r2_key_original, r2_key_thumb,
      sender_name, camera_model, watermark_text, original_filename, file_size, thumb_size,
      width, height, upload_status, batch_index, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 'test.jpg', ?, ?, NULL, NULL, ?, 0, ?, ?)`,
  )
    .bind(
      photoId,
      opts.receiverId,
      opts.sessionId ?? null,
      r2KeyOriginal,
      r2KeyThumb,
      opts.senderName === undefined ? "@tester" : opts.senderName,
      fileSize,
      thumbSize,
      opts.status ?? "completed",
      now,
      now,
    )
    .run();

  return { photoId, r2KeyOriginal, r2KeyThumb };
}
