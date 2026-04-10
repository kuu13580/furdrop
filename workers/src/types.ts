export interface Env {
  DB: D1Database;

  // R2バケット (Workers binding — HEAD等に使用)
  R2_ORIGINALS: R2Bucket;
  R2_THUMBS: R2Bucket;

  // 環境変数
  ENVIRONMENT: "production" | "development";
  FIREBASE_PROJECT_ID: string;

  // R2 S3互換API (Presigned URL生成用)
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ENDPOINT: string;
  R2_BUCKET_ORIGINALS: string;
  R2_BUCKET_THUMBS: string;
}
