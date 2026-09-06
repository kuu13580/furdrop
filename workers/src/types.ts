/** 認証済みリクエストの Hono 型パラメータ */
export type AuthEnv = {
  Bindings: Env;
  Variables: { uid: string; email: string; name?: string; picture?: string };
};

/**
 * Cloudflare Email Service の送信バインディング。
 * 旧 Email Routing の `SendEmail` (EmailMessage を渡す) とは別物で、素のオブジェクトを取る。
 * public beta で workers-types が追随していないので最小限を自前で宣言する。
 */
export interface SendEmailBinding {
  send(message: {
    from: string;
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
    headers?: Record<string, string>;
  }): Promise<void>;
}

export interface Env {
  DB: D1Database;

  // R2バケット (Workers binding — HEAD等に使用)
  R2_ORIGINALS: R2Bucket;
  R2_THUMBS: R2Bucket;

  // Firebase Auth 公開鍵キャッシュ
  PUBLIC_JWK_CACHE_KV: KVNamespace;
  PUBLIC_JWK_CACHE_KEY: string;

  // 環境変数
  ENVIRONMENT: "production" | "development";
  FIREBASE_PROJECT_ID: string;

  // R2 S3互換API (Presigned URL生成用)
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_ENDPOINT: string;
  R2_BUCKET_ORIGINALS: string;
  R2_BUCKET_THUMBS: string;

  // Rate limiting (X05) — wrangler.toml の [[unsafe.bindings]] で宣言
  RATE_LIMITER_SESSION: RateLimit;
  RATE_LIMITER_PHOTOS: RateLimit;
  RATE_LIMITER_PROFILE: RateLimit;
  /** R08: 一括 DL (認証済み UID 単位) */
  RATE_LIMITER_ZIP: RateLimit;
  /** R09: 確認メールの送信 (認証済み UID 単位)。任意のアドレスへメールを撃たせないため */
  RATE_LIMITER_VERIFY: RateLimit;

  /** R09: 通知メールの送信 — wrangler.toml の [[send_email]]。API キーは持たない */
  EMAIL: SendEmailBinding;

  /** フロントのオリジン (メール内の人間向けリンク用)。例: https://furdrop.app */
  APP_ORIGIN: string;
  /**
   * Workers 自身のオリジン。RFC 8058 のワンクリック解除はメールクライアントが POST するため
   * 静的な Pages では受けられず、この API を指す必要がある。
   * Cron には Request が無く c.req.url から導出できないので変数で持つ。
   */
  API_ORIGIN: string;

  // テスト時のみセットされ、firebase-auth-cloudflare-workers の verifyIdToken に
  // 第 3 引数として渡すと Auth Emulator REST に切り替わる (本番は未定義のままで no-op)。
  FIREBASE_AUTH_EMULATOR_HOST?: string;
}
