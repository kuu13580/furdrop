import { defineConfig, devices } from "@playwright/test";

const FRONTEND_PORT = 4000;
const WORKERS_PORT = 9000;
const EMULATOR_HOST = "127.0.0.1:9099";

// frontend を `.env.local` 無しで動かすため、必要な VITE_* を webServer.env で直接渡す。
// 値はすべて Auth Emulator 想定のダミー (本物の Firebase プロジェクトには触らない)。
const VITE_ENV = {
  VITE_FIREBASE_API_KEY: "demo-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo-furdrop.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "demo-furdrop",
  VITE_FIREBASE_STORAGE_BUCKET: "demo-furdrop.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "0",
  VITE_FIREBASE_APP_ID: "1:0:web:demo",
  VITE_FIREBASE_MEASUREMENT_ID: "",
  VITE_FIREBASE_AUTH_EMULATOR_HOST: EMULATOR_HOST,
  VITE_API_BASE_URL: `http://localhost:${WORKERS_PORT}`,
  VITE_PUBLIC_HOST: `http://localhost:${FRONTEND_PORT}`,
  VITE_FEEDBACK_URL: "",
};

export default defineConfig({
  testDir: "./tests",
  // Auth Emulator は global state (作ったユーザーは全 spec から見える)。
  // ユーザー名衝突は spec 側で UUID 付きにして回避するが、念のため逐次実行。
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    // 既存の spec は日本語の文言で要素を引くため、ブラウザ言語を ja に固定する
    // (未指定だと en-US になり、翻訳済みの画面が英語で描画されて全滅する)。
    // ロケール自体を検証する spec は localStorage / ?lang= で個別に上書きする。
    locale: "ja-JP",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // テスト専用 wrangler.test.toml を使うことで `pnpm generate` を回避
      // (CI で復号鍵を持たなくても動く + テスト用の binding と Emulator 設定が反映される)
      command: `pnpm --filter workers dev:test`,
      url: `http://localhost:${WORKERS_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // frontend は .env.local 無しで起動できるよう env をすべて注入
      command: `pnpm --filter frontend dev`,
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: VITE_ENV,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
