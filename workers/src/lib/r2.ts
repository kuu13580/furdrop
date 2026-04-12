import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "../types";

function createS3Client(env: Env): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

/** R2オブジェクトキーを生成 */
export function buildR2Key(handle: string, photoId: string, type: "original" | "thumb"): string {
  const now = new Date();
  const yearMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const suffix = type === "thumb" ? `${photoId}_thumb.jpg` : `${photoId}.jpg`;
  return `${handle}/${yearMonth}/${suffix}`;
}

/** オリジナル画像アップロード用 Presigned PUT URL */
export async function createUploadUrl(
  env: Env,
  key: string,
  contentLength: number,
): Promise<string> {
  const client = createS3Client(env);
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_ORIGINALS,
    Key: key,
    ContentType: "image/jpeg",
    ContentLength: contentLength,
  });
  return getSignedUrl(client, command, { expiresIn: 900 });
}

const MAX_THUMB_SIZE = 512 * 1024; // 512KB

/** サムネイルアップロード用 Presigned PUT URL */
export async function createThumbUploadUrl(
  env: Env,
  key: string,
  contentLength: number = MAX_THUMB_SIZE,
): Promise<string> {
  const client = createS3Client(env);
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_THUMBS,
    Key: key,
    ContentType: "image/jpeg",
    ContentLength: Math.min(contentLength, MAX_THUMB_SIZE),
  });
  return getSignedUrl(client, command, { expiresIn: 900 });
}

/** サムネイル表示用 URL（開発時はプロキシ、本番はPresigned GET） */
export async function createThumbViewUrl(env: Env, key: string): Promise<string> {
  if (env.ENVIRONMENT !== "production") {
    return `/dev/images/thumbs/${key}`;
  }
  const client = createS3Client(env);
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_THUMBS,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}

/** オリジナルDL用 URL（開発時はプロキシ、本番はPresigned GET） */
export async function createDownloadUrl(env: Env, key: string): Promise<string> {
  if (env.ENVIRONMENT !== "production") {
    return `/dev/images/originals/${key}`;
  }
  const client = createS3Client(env);
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_ORIGINALS,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}
